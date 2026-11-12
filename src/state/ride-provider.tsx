import type { ReactNode } from 'react';
import React, { createContext, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { createAppSocket } from '@/api/realtime';

import { ApiError, apiRequest, getSocketUrl, invalidateApiCache, isConnectionFailure } from '@/api/client';
import { offlineSnapshots, type BookingDraft } from '@/offline/snapshots';
import { isServerReachable } from '@/offline/connectivity';
import { getOfflineRoadRoute } from '@/offline/road-route';
import { getDemoRoadRoute } from '@/api/demo-routing';
import { useSession } from '@/auth/session-provider';
import { useAppForeground } from '@/hooks/use-foreground-screen';
import { useBookingAvailability } from '@/providers/booking-availability-provider';
import { bookingUnavailableCode } from '@/domain/booking-availability';
import { demoAddresses, demoDriver, demoOrders, demoPassenger } from '@/data/demo';
import { firstRideAddresses } from '@/data/first-ride-addresses';
import {
  buildDestinationHistory,
  buildRideAddressHistory,
  type DestinationHistoryItem,
} from '@/domain/address-history';
import {
  isDestinationAddressBookable,
  isPickupAddressBookable,
} from '@/domain/address-precision';
import { isAssignedDriverOrder } from '@/domain/driver-order-queue';
import { driverRatingQueueReducer, emptyDriverRatingQueue } from '@/domain/driver-rating-queue';
import type { InitialLegalAcceptance } from '@/legal/documents';
import {
  buildDemoDriverOffer,
  demoWaitingTransition,
  placeDemoDriverNearPickup,
} from '@/domain/demo-flow';
import type {
  Address,
  Coordinates,
  PaymentMethod,
  RideChatMessage,
  RideOrder,
  RideOrderSummary,
  RideStatus,
  RouteSummary,
  Tariff,
} from '@/domain/models';
import {
  buildTariffs,
  billableRoutePoints,
  calculateCommissionMinor,
  calculateMultiStopFareMinor,
  calculateWaitingChargeMinor,
  classifyMultiStopPricingScope,
  classifyPricingScope,
  defaultPricingRules,
  fareRoundingMinor,
  fareRoundingMode,
  roundFareMinor,
  isGrahovoAddress,
} from '@/domain/pricing';
import { canControlRideWaiting, canTransitionRide, driverRouteTarget, driverTransitionConfirmed } from '@/domain/ride-state';
import { isReservedRide } from '@/domain/scheduled-ride';
import { addRideRoutePoint, normalizeRouteStops, replaceRouteStop, sameRouteStop, type DriverRoutePointKind } from '@/domain/route-stops';
import {
  searchPriceIncreaseChoices,
  searchPriceIncreaseOfferSlot,
} from '@/domain/search-price-increase';
import { activeWaitingSeconds } from '@/domain/waiting';
import { getInstallationId } from '@/storage/device-id';

const ESTIMATED_ROUTE_RETRY_MS = 31_000;
const DRIVER_OFFERS_REFRESH_ERROR = 'Не удалось обновить доступные заказы. Проверьте соединение.';

type RideContextValue = {
  pickup: Address | null;
  destinations: Address[];
  destination: Address | null;
  routeCoordinates: Coordinates[];
  routeSummary: RouteSummary | null;
  bookingFare: Tariff;
  selectedPaymentMethod: PaymentMethod;
  bookingComment: string;
  setBookingComment: (value: string) => void;
  scheduledAt?: string;
  selectScheduledAt: (value?: string) => void;
  currentRide: RideOrder | null;
  driverRide: RideOrder | null;
  nextDriverRide: RideOrder | null;
  driverOffer: RideOrder | null;
  driverPreorders: RideOrder[];
  driverRatingRide: RideOrder | null;
  driverRatingBusy: boolean;
  driverRatingError: string | null;
  dismissDriverRating: () => void;
  orders: RideOrderSummary[];
  adminOrders: RideOrderSummary[];
  passengerOrdersHasMore: boolean;
  adminOrdersHasMore: boolean;
  passengerOrdersLoaded: boolean;
  adminOrdersLoaded: boolean;
  destinationHistory: DestinationHistoryItem[];
  addressHistory: DestinationHistoryItem[];
  firstRideSuggestions: Address[];
  bootstrapReady: boolean;
  quoteStatus: 'idle' | 'loading' | 'ready' | 'offline' | 'error';
  busy: boolean;
  error: string | null;
  chatUnreadCounts: Record<string, number>;
  latestIncomingChatMessage: RideChatMessage | null;
  subscribeRideUpdates: (listener: (ride: RideOrder) => void) => () => void;
  setPickup: (address: Address) => void;
  setDestination: (address: Address) => void;
  setDestinationAt: (index: number, address: Address) => void;
  addDestination: (address: Address) => void;
  removeDestination: (index: number) => void;
  reorderDestinations: (fromIndex: number, toIndex: number) => void;
  requestQuote: () => Promise<void>;
  setSelectedPaymentMethod: (method: PaymentMethod) => void;
  createRide: (
    comment?: string,
    legalAcceptance?: InitialLegalAcceptance,
  ) => Promise<RideOrder | null>;
  createDriverOffer: () => Promise<RideOrder | null>;
  confirmSearchPriceIncrease: (expectedPriceMinor: number, increaseMinor: number) => Promise<boolean>;
  transitionRide: (status: RideStatus) => Promise<void>;
  transitionDriverRide: (status: RideStatus) => Promise<boolean>;
  completeDriverStop: () => Promise<void>;
  addDriverRoutePoint: (kind: DriverRoutePointKind, address: Address) => Promise<RideOrder>;
  startWaiting: () => Promise<void>;
  stopWaiting: () => Promise<void>;
  releaseDriverRide: (reason: string, orderId?: string) => Promise<boolean>;
  cancelRide: () => Promise<boolean>;
  rateRide: (score: number) => Promise<void>;
  rateDriverRide: (score: number) => Promise<void>;
  resetRide: () => void;
  resetDriverRide: () => void;
  refresh: () => Promise<void>;
  markRideChatRead: (orderId: string) => Promise<void>;
  loadPassengerOrders: () => Promise<void>;
  loadAdminOrders: () => Promise<void>;
  loadMorePassengerOrders: () => Promise<void>;
  loadMoreAdminOrders: () => Promise<void>;
};

type RideBootstrap = {
  activePassengerOrder: RideOrder | null;
  destinationHistory: DestinationHistoryItem[];
  addressHistory?: DestinationHistoryItem[];
  firstRideSuggestions?: Address[];
  driverQueue: {
    current: RideOrder | null;
    next: RideOrder | null;
    offer: RideOrder | null;
  };
  driverPreorders?: RideOrder[];
  chatUnreadCounts: Record<string, number>;
};

const RideContext = createContext<RideContextValue | null>(null);
type RideAddressValue = Pick<RideContextValue, 'pickup' | 'destinations' | 'setPickup' | 'setDestination' | 'setDestinationAt' | 'addDestination' | 'destinationHistory' | 'addressHistory' | 'firstRideSuggestions'>;
const RideAddressContext = createContext<RideAddressValue | null>(null);
const RideBootstrapContext = createContext(false);

function isActive(order: RideOrder): boolean {
  return !['completed', 'cancelled'].includes(order.status);
}

function toOrderSummary(ride: RideOrder): RideOrderSummary {
  return {
    id: ride.id,
    passengerId: ride.passengerId,
    pickup: ride.pickup,
    destination: ride.destination,
    tariff: ride.tariff,
    status: ride.status,
    priceMinor: ride.priceMinor,
    scheduledAt: ride.scheduledAt,
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
  };
}

function upsertOrderSummary(
  orders: RideOrderSummary[],
  ride: RideOrderSummary,
): RideOrderSummary[] {
  const exists = orders.some((item) => item.id === ride.id);
  return exists
    ? orders.map((item) => (item.id === ride.id ? ride : item))
    : [ride, ...orders];
}

function appendUniqueOrders(
  current: RideOrderSummary[],
  next: RideOrderSummary[],
): RideOrderSummary[] {
  const existingIds = new Set(current.map((order) => order.id));
  return [...current, ...next.filter((order) => !existingIds.has(order.id))];
}

function addCompletedDestination(
  history: DestinationHistoryItem[],
  ride: RideOrder,
): DestinationHistoryItem[] {
  if (ride.status !== 'completed') return history;
  const key = `${ride.destination.coordinates.latitude.toFixed(5)}:${ride.destination.coordinates.longitude.toFixed(5)}`;
  const next = history.map((item) => ({ ...item, isLastDestination: false }));
  const existingIndex = next.findIndex((item) =>
    `${item.address.coordinates.latitude.toFixed(5)}:${item.address.coordinates.longitude.toFixed(5)}` === key,
  );
  if (existingIndex >= 0) {
    const existing = next[existingIndex]!;
    next[existingIndex] = {
      address: ride.destination,
      tripCount: existing.tripCount + 1,
      lastUsedAt: ride.updatedAt,
      isLastDestination: true,
    };
  } else {
    next.push({
      address: ride.destination,
      tripCount: 1,
      lastUsedAt: ride.updatedAt,
      isLastDestination: true,
    });
  }
  return next
    .sort(
      (left, right) =>
        right.tripCount - left.tripCount ||
        Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt),
    )
    .slice(0, 20);
}

function updateDriverCoordinates(order: RideOrder, coordinates: Coordinates): RideOrder {
  if (!order.driver) return order;
  if (order.driver.coordinates?.latitude === coordinates.latitude &&
    order.driver.coordinates?.longitude === coordinates.longitude) return order;
  return { ...order, driver: { ...order.driver, coordinates } };
}

function idempotencyKey(): string {
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function RideProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const foreground = useAppForeground();
  const quoteVisible = foreground && ['/', '/vk', '/max', '/telegram', '/order-confirmation'].includes(pathname);
  const { token, user, refreshSession, markInitialLegalConsentAccepted } = useSession();
  const { checkBooking, showBookingUnavailable } = useBookingAvailability();
  const demoSession = token?.startsWith('demo:') ?? false;
  const userId = user?.id;
  const isDriver = user?.roles.includes('driver') ?? false;
  const isAdmin = user?.roles.includes('admin') ?? false;
  const [pickup, setPickup] = useState<Address | null>(null);
  const [destinations, setDestinations] = useState<Address[]>([]);
  const destination = destinations[destinations.length - 1] ?? null;
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [bookingComment, setBookingComment] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const [currentRide, setCurrentRide] = useState<RideOrder | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>();
  const [driverPreorders, setDriverPreorders] = useState<RideOrder[]>([]);
  const [driverRide, setDriverRide] = useState<RideOrder | null>(null);
  const [nextDriverRide, setNextDriverRide] = useState<RideOrder | null>(null);
  const [driverOffer, setDriverOffer] = useState<RideOrder | null>(null);
  const [driverRatings, dispatchDriverRating] = useReducer(driverRatingQueueReducer, emptyDriverRatingQueue);
  const driverRatingRide = driverRatings.pending[0] ?? null;
  const [driverRatingBusy, setDriverRatingBusy] = useState(false);
  const [driverRatingError, setDriverRatingError] = useState<string | null>(null);
  const driverRatingInFlight = useRef(false);
  const passengerRatingInFlight = useRef(false);
  const [orders, setOrders] = useState<RideOrderSummary[]>([]);
  const [adminOrders, setAdminOrders] = useState<RideOrderSummary[]>([]);
  const [passengerOrdersHasMore, setPassengerOrdersHasMore] = useState(false);
  const [adminOrdersHasMore, setAdminOrdersHasMore] = useState(false);
  const [passengerOrdersLoaded, setPassengerOrdersLoaded] = useState(false);
  const [adminOrdersLoaded, setAdminOrdersLoaded] = useState(false);
  const [destinationHistory, setDestinationHistory] = useState<DestinationHistoryItem[]>([]);
  const [addressHistory, setAddressHistory] = useState<DestinationHistoryItem[]>([]);
  const [firstRideSuggestions, setFirstRideSuggestions] = useState(firstRideAddresses);
  const [bootstrappedToken, setBootstrappedToken] = useState<string | null>(null);
  const bootstrapReady = !!token && bootstrappedToken === token;
  const [bookingFare, setBookingFare] = useState<Tariff>(() =>
    buildTariffs(11_600, 'district').find(({ code }) => code === 'economy')!,
  );
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'ready' | 'offline' | 'error'>('idle');
  const [quoteToken, setQuoteToken] = useState<string | null>(null);
  const [quoteRequestPending, setQuoteRequestPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [chatUnreadCounts, setChatUnreadCounts] = useState<Record<string, number>>({});
  const [latestIncomingChatMessage, setLatestIncomingChatMessage] = useState<RideChatMessage | null>(null);
  // Preserve every transition even when React batches completion and promotion of the next ride.
  const rideUpdateListeners = useRef(new Set<(ride: RideOrder) => void>());
  const subscribeRideUpdates = useCallback((listener: (ride: RideOrder) => void) => {
    rideUpdateListeners.current.add(listener);
    return () => { rideUpdateListeners.current.delete(listener); };
  }, []);
  const emitRideUpdate = useCallback((ride: RideOrder) => {
    rideUpdateListeners.current.forEach(listener => listener(ride));
  }, []);
  const quoteRequestController = useRef<AbortController | null>(null);
  const quoteRequestId = useRef(0);
  const completedHistoryOrderIds = useRef(new Set<string>());
  const pendingOrderCreation = useRef<{ fingerprint: string; key: string } | null>(null);
  const transitionInFlight = useRef(false);
  const sessionUserIdRef = useRef(userId);

  useEffect(() => {
    if (!userId || demoSession) return;
    let active = true;
    void offlineSnapshots.get<BookingDraft>(userId,'booking-draft').then(draft => {
      if (!active) return;
      if (draft && Array.isArray(draft.destinations) && draft.destinations.length <= 10 &&
          draft.destinations.every(address => Number.isFinite(address?.coordinates?.latitude) && Number.isFinite(address?.coordinates?.longitude))) {
        if (draft.pickup && Number.isFinite(draft.pickup.coordinates?.latitude) && Number.isFinite(draft.pickup.coordinates?.longitude)) setPickup(draft.pickup);
        setDestinations(draft.destinations);
        setSelectedPaymentMethod(draft.paymentMethod === 'transfer' ? 'transfer' : 'cash');
        setBookingComment(typeof draft.comment === 'string' ? draft.comment.slice(0,1000) : '');
        if (draft.scheduledAt && Date.parse(draft.scheduledAt) > Date.now()+30*60_000) setScheduledAt(draft.scheduledAt);
      }
      setDraftRestored(true);
    });
    return () => { active=false; };
  }, [demoSession,userId]);

  useEffect(() => {
    if (!userId || demoSession || !draftRestored) return;
    // No automatic booking is queued. Restoring a draft always requires a new server quote and a tap.
    void offlineSnapshots.set(userId,'booking-draft',{pickup,destinations,paymentMethod:selectedPaymentMethod,scheduledAt,comment:bookingComment});
  }, [userId,demoSession,draftRestored,pickup,destinations,selectedPaymentMethod,scheduledAt,bookingComment]);

  useEffect(() => {
    sessionUserIdRef.current = userId;
  }, [userId]);

  const invalidateQuote = useCallback(() => {
    quoteRequestId.current += 1;
    quoteRequestController.current?.abort();
    quoteRequestController.current = null;
    setQuoteRequestPending(false);
    setRouteCoordinates([]);
    setRouteSummary(null);
    setQuoteToken(null);
    setQuoteStatus('idle');
  }, []);

  const selectScheduledAt = useCallback((value?: string) => {
    if (value === scheduledAt) return;
    invalidateQuote();
    setScheduledAt(value);
  }, [invalidateQuote, scheduledAt]);

  useEffect(() => {
    if (!quoteVisible && quoteRequestController.current) invalidateQuote();
  }, [invalidateQuote, quoteVisible]);

  const selectPickup = useCallback((address: Address) => {
    invalidateQuote();
    setPickup(address);
    setDestinations((current) => normalizeRouteStops(address, current));
  }, [invalidateQuote]);

  const selectDestination = useCallback((address: Address) => {
    invalidateQuote();
    setDestinations((current) =>
      normalizeRouteStops(pickup, current.length ? current.map((item, index) => index === current.length - 1 ? address : item) : [address]),
    );
  }, [invalidateQuote, pickup]);

  const updateDestinations = useCallback(
    (update: (current: Address[]) => Address[]) => {
      invalidateQuote();
      setDestinations((current) => normalizeRouteStops(pickup, update(current)));
    },
    [invalidateQuote, pickup],
  );

  const setDestinationAt = useCallback(
    (index: number, address: Address) => {
      updateDestinations((current) => replaceRouteStop(current, index, address));
    },
    [updateDestinations],
  );

  const addDestination = useCallback(
    (address: Address) => updateDestinations((current) => [...current, address].slice(0, 5)),
    [updateDestinations],
  );

  const removeDestination = useCallback(
    (index: number) => updateDestinations((current) => current.filter((_, itemIndex) => itemIndex !== index)),
    [updateDestinations],
  );

  const reorderDestinations = useCallback(
    (fromIndex: number, toIndex: number) => {
      updateDestinations((current) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= current.length ||
          toIndex >= current.length
        ) return current;
        const next = [...current];
        const [moved] = next.splice(fromIndex, 1);
        if (moved) next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [updateDestinations],
  );

  const applyPassengerOrder = useCallback((ride: RideOrder) => {
    emitRideUpdate(ride);
    const summary = toOrderSummary(ride);
    setOrders((previous) => upsertOrderSummary(previous, summary));
    setAdminOrders((previous) => upsertOrderSummary(previous, summary));
    setCurrentRide(ride);
    if (ride.status !== 'draft') {
      setAddressHistory(history => history.some(item => sameRouteStop(item.address, ride.pickup)) ? history :
        [{ address: ride.pickup, lastUsedAt: ride.updatedAt, tripCount: 1, isLastDestination: false }, ...history].slice(0, 20));
    }
    if (ride.status === 'completed' && !completedHistoryOrderIds.current.has(ride.id)) {
      completedHistoryOrderIds.current.add(ride.id);
      setDestinationHistory((history) => addCompletedDestination(history, ride));
    }
    if (ride.routeCoordinates?.length) setRouteCoordinates(ride.routeCoordinates);
  }, [emitRideUpdate]);

  const applyDriverOrder = useCallback((ride: RideOrder) => {
    emitRideUpdate(ride);
    dispatchDriverRating({ type: 'updated', ride });
    if (isReservedRide(ride) || (ride.scheduledAt && ride.status === 'searching')) return;
    if (isAssignedDriverOrder(ride)) {
      if (ride.driverQueuePosition === 2) {
        setNextDriverRide(ride);
      } else {
        setDriverRide(ride);
        setNextDriverRide((current) => (current?.id === ride.id ? null : current));
      }
      setDriverOffer((current) => (current?.id === ride.id ? null : current));
    } else if (ride.status === 'searching') {
      setDriverOffer(ride);
      setDriverRide((current) => (current && isAssignedDriverOrder(current) ? current : ride));
    } else {
      setDriverRide((current) => (current?.id === ride.id ? (ride.status === 'completed' ? null : ride) : current));
      setNextDriverRide((current) => (current?.id === ride.id ? null : current));
      setDriverOffer((current) => (current?.id === ride.id ? null : current));
    }
    setAdminOrders((previous) => upsertOrderSummary(previous, toOrderSummary(ride)));
  }, [emitRideUpdate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDriverPreorders([]);
      if (demoSession) {
        setScheduledAt(undefined);
        const passengerOrders = userId === demoPassenger.id ? demoOrders : [];
        const demoHistory = buildDestinationHistory(passengerOrders, userId);
        const passengerOrderSummaries = passengerOrders.map(toOrderSummary);
        setPickup(null);
        setDestinations([]);
        setOrders(passengerOrderSummaries);
        setAdminOrders(isAdmin ? demoOrders.map(toOrderSummary) : []);
        setPassengerOrdersHasMore(false);
        setAdminOrdersHasMore(false);
        setPassengerOrdersLoaded(true);
        setAdminOrdersLoaded(true);
        setDestinationHistory(demoHistory.items);
        setAddressHistory(userId ? buildRideAddressHistory(passengerOrders, userId) : []);
        completedHistoryOrderIds.current = new Set(
          passengerOrders.filter((order) => order.status === 'completed').map((order) => order.id),
        );
        setCurrentRide(passengerOrders.find(isActive) ?? null);
        setDriverRide(null);
        setNextDriverRide(null);
        setDriverOffer(null);
        setChatUnreadCounts({});
        setBootstrappedToken(token);
        return;
      }

      // SessionScopedRideProviders remounts us when the account changes.
      // A token refresh must preserve the draft, including local directory places
      // that are also offered to demo passengers.

      if (!token) {
        setScheduledAt(undefined);
        setPickup(null);
        setDestinations([]);
        setOrders([]);
        setAdminOrders([]);
        setPassengerOrdersHasMore(false);
        setAdminOrdersHasMore(false);
        setPassengerOrdersLoaded(false);
        setAdminOrdersLoaded(false);
        setDestinationHistory([]);
        setAddressHistory([]);
        completedHistoryOrderIds.current.clear();
        setCurrentRide(null);
        setDriverRide(null);
        setNextDriverRide(null);
        setDriverOffer(null);
        setChatUnreadCounts({});
        setBootstrappedToken(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [demoSession, isAdmin, token, userId]);

  const refresh = useCallback(async () => {
    if (!token || demoSession) return;
    const sessionUserId = userId;
    try {
      const bootstrap = await apiRequest<RideBootstrap>('/v1/bootstrap', { token, offlineFallback:true });
      if (sessionUserIdRef.current !== sessionUserId) return;
      // Bootstrap only contains active trips. Reconnecting after a failed
      // rating request must not discard the completed trip and selected stars.
      setCurrentRide(current => bootstrap.activePassengerOrder ??
        (current?.status === 'completed' && !current.ratings?.byPassenger ? current : null));
      setDriverRide(bootstrap.driverQueue.current ?? (isServerReachable() ? bootstrap.driverQueue.offer : null));
      setNextDriverRide(bootstrap.driverQueue.next);
      setDriverOffer(isServerReachable() ? bootstrap.driverQueue.offer : null);
      setDriverPreorders(isServerReachable() ? bootstrap.driverPreorders ?? [] : []);
      setDestinationHistory(bootstrap.destinationHistory);
      setAddressHistory(bootstrap.addressHistory ?? bootstrap.destinationHistory);
      setFirstRideSuggestions(bootstrap.firstRideSuggestions ?? firstRideAddresses);
      setChatUnreadCounts(bootstrap.chatUnreadCounts);
      setBootstrapError(null);
      if (isServerReachable()) setError(current => current === DRIVER_OFFERS_REFRESH_ERROR ? null : current);
    } catch (reason) {
      if (sessionUserIdRef.current !== sessionUserId) return;
      setBootstrapError(reason instanceof Error ? reason.message : 'Не удалось обновить заказы');
    }
  }, [demoSession, token, userId]);

  const markRideChatRead = useCallback(async (orderId: string) => {
    setChatUnreadCounts((current) => {
      if (!current[orderId]) return current;
      return { ...current, [orderId]: 0 };
    });
    if (!token || demoSession) return;
    try {
      await apiRequest(`/v1/orders/${orderId}/messages/read`, {
        method: 'POST',
        token,
      });
    } catch (reason) {
      void refresh();
      throw reason;
    }
  }, [demoSession, refresh, token]);

  useEffect(() => {
    if (!token || demoSession) return;
    let active = true;
    const bootstrapTimer = setTimeout(() => {
      void (async () => {
        const saved = userId ? await offlineSnapshots.get<RideBootstrap>(userId,'/v1/bootstrap') : null;
        if (!active) return;
        if (saved?.driverQueue && Array.isArray(saved.destinationHistory)) {
          setCurrentRide(saved.activePassengerOrder);
          if (saved.activePassengerOrder?.routeCoordinates) setRouteCoordinates(saved.activePassengerOrder.routeCoordinates);
          setDriverRide(saved.driverQueue.current);
          setNextDriverRide(saved.driverQueue.next);
          setDestinationHistory(saved.destinationHistory);
          setAddressHistory(saved.addressHistory ?? saved.destinationHistory);
          setFirstRideSuggestions(saved.firstRideSuggestions ?? firstRideAddresses);
          setChatUnreadCounts(saved.chatUnreadCounts ?? {});
        }
        setBootstrappedToken(token);
        await refresh();
      })().finally(() => {
        if (active) setBootstrappedToken(token);
      });
    }, 0);
    return () => {
      active = false;
      clearTimeout(bootstrapTimer);
    };
  }, [demoSession, refresh, token, userId]);

  const loadPassengerOrders = useCallback(async () => {
    if (!token || demoSession) return;
    try {
      setError(null);
      const firstPage = await apiRequest<RideOrderSummary[]>(
        '/v1/orders?scope=passenger&view=summary&limit=20',
        { token, offlineFallback:true },
      );
      setOrders(firstPage);
      setPassengerOrdersHasMore(firstPage.length === 20);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить поездки');
    } finally {
      setPassengerOrdersLoaded(true);
    }
  }, [demoSession, token]);

  const loadAdminOrders = useCallback(async () => {
    if (!token || demoSession || !isAdmin) return;
    try {
      setError(null);
      const firstPage = await apiRequest<RideOrderSummary[]>(
        '/v1/orders?view=summary&limit=20',
        { token },
      );
      setAdminOrders(firstPage);
      setAdminOrdersHasMore(firstPage.length === 20);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить заказы');
    } finally {
      setAdminOrdersLoaded(true);
    }
  }, [demoSession, isAdmin, token]);

  const loadMorePassengerOrders = useCallback(async () => {
    if (!token || demoSession || !passengerOrdersHasMore) return;
    const cursor = orders[orders.length - 1];
    if (!cursor) return;
    const next = await apiRequest<RideOrderSummary[]>(
      `/v1/orders?scope=passenger&view=summary&limit=20&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`,
      { token },
    );
    setOrders((current) => appendUniqueOrders(current, next));
    setPassengerOrdersHasMore(next.length === 20);
  }, [demoSession, orders, passengerOrdersHasMore, token]);

  const loadMoreAdminOrders = useCallback(async () => {
    if (!token || demoSession || !isAdmin || !adminOrdersHasMore) return;
    const cursor = adminOrders[adminOrders.length - 1];
    if (!cursor) return;
    const next = await apiRequest<RideOrderSummary[]>(
      `/v1/orders?view=summary&limit=20&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`,
      { token },
    );
    setAdminOrders((current) => appendUniqueOrders(current, next));
    setAdminOrdersHasMore(next.length === 20);
  }, [adminOrders, adminOrdersHasMore, demoSession, isAdmin, token]);

  useEffect(() => {
    if (!token || demoSession || !bootstrapReady || !foreground) return;
    const socketUrl = getSocketUrl();
    if (!socketUrl) return;
    const socket = createAppSocket(socketUrl, token);
    const handleReconnect = () => {
      invalidateApiCache(['orders', 'stats', 'admin', 'profile']);
      void refresh();
    };
    // Also close the gap between the initial bootstrap and socket connection.
    socket.on('connect', handleReconnect);
    socket.on('preorders:changed', () => { if (isDriver) void refresh(); });
    let offerRequestId = 0;
    socket.on('order:updated', (order: RideOrder) => {
      invalidateApiCache(['orders', 'stats', 'admin', 'profile']);
      if (isAdmin) {
        setAdminOrders((previous) => upsertOrderSummary(previous, toOrderSummary(order)));
      }
      if (order.passengerId === userId) applyPassengerOrder(order);
      else if (isDriver && !isAdmin) applyDriverOrder(order);
      else if (isDriver) {
        setDriverRide((current) => (current?.id === order.id ? order : current));
      }
    });
    socket.on('driver:location', (coordinates: Coordinates) => {
      setCurrentRide((current) =>
        current ? updateDriverCoordinates(current, coordinates) : current,
      );
      setDriverRide((current) =>
        current ? updateDriverCoordinates(current, coordinates) : current,
      );
      setNextDriverRide((current) =>
        current ? updateDriverCoordinates(current, coordinates) : current,
      );
    });
    socket.on(
      'passenger:location',
      (payload: { orderId: string; coordinates: Coordinates | null }) => {
        setDriverRide((current) => {
          if (!current || current.id !== payload.orderId) return current;
          if (current.passengerCoordinates?.latitude === payload.coordinates?.latitude &&
            current.passengerCoordinates?.longitude === payload.coordinates?.longitude) return current;
          return {
            ...current,
            passengerCoordinates: payload.coordinates ?? undefined,
          };
        });
      },
    );
    socket.on('order:available', (order: RideOrder) => {
      invalidateApiCache(['orders', 'admin', 'profile']);
      if (isDriver) {
        offerRequestId += 1;
        setDriverOffer(order);
        setDriverRide((current) =>
          !current || !isAssignedDriverOrder(current) || current.id === order.id
            ? order
            : current,
        );
      }
    });
    socket.on('order:unavailable', ({ orderId }: { orderId: string }) => {
      invalidateApiCache(['orders', 'admin', 'profile']);
      if (!isDriver) return;
      const requestId = ++offerRequestId;
      setDriverOffer((current) => current?.id === orderId ? null : current);
      setDriverRide((current) => current?.id === orderId && current.status === 'searching' ? null : current);
      void apiRequest<RideOrder[]>('/v1/driver/offers', { token }).then((offers) => {
        if (!socket.connected || requestId !== offerRequestId) return;
        const offer = offers[0] ?? null;
        setDriverOffer(offer);
        setDriverRide((current) => current && isAssignedDriverOrder(current) ? current : offer);
        setError(current => current === DRIVER_OFFERS_REFRESH_ERROR ? null : current);
      }).catch(reason => {
        if (reason instanceof ApiError && reason.code === 'REQUEST_ABORTED') return;
        if (socket.connected && requestId === offerRequestId) {
          setError(DRIVER_OFFERS_REFRESH_ERROR);
        }
      });
    });
    socket.on('ride-chat:message', (message: RideChatMessage) => {
      if (message.sender.id === userId) return;
      setLatestIncomingChatMessage(message);
      setChatUnreadCounts((current) => ({
        ...current,
        [message.orderId]: (current[message.orderId] ?? 0) + 1,
      }));
    });
    socket.on(
      'ride-chat:read',
      (payload: { orderId: string; userId: string; unreadCount: number }) => {
        if (payload.userId !== userId) return;
        setChatUnreadCounts((current) => current[payload.orderId] === payload.unreadCount ? current : ({
          ...current,
          [payload.orderId]: payload.unreadCount,
        }));
      },
    );
    socket.on('application:updated', () => {
      invalidateApiCache(['profile', 'admin']);
      void refreshSession().catch(() => {
        setError('Статус заявки обновлён. Перезапустите приложение, чтобы обновить доступ.');
      });
    });
    socket.on('account:access-changed', () => {
      invalidateApiCache(['profile', 'admin']);
      void refreshSession().catch(() => {
        setError('Доступ изменён. Перезапустите приложение, чтобы обновить статус.');
      });
    });
    socket.on('profile:updated', () => {
      invalidateApiCache(['profile', 'admin']);
      void refreshSession().catch(() => {
        setError('Данные профиля изменены. Откройте профиль повторно, чтобы обновить их.');
      });
    });
    return () => {
      offerRequestId += 1;
      socket.off('connect', handleReconnect);
      socket.disconnect();
    };
  }, [
    applyDriverOrder,
    applyPassengerOrder,
    bootstrapReady,
    foreground,
    demoSession,
    isAdmin,
    isDriver,
    refresh,
    refreshSession,
    token,
    userId,
  ]);

  useEffect(() => {
    if (!token || demoSession || !bootstrapReady) return;
    let previousState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = nextState === 'active' && previousState !== 'active';
      previousState = nextState;
      if (returnedToForeground) void refresh();
    });
    const handleOnline = () => void refresh();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }
    return () => {
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [bootstrapReady, demoSession, refresh, token]);

  const requestQuote = useCallback(async (confirmationMessage?: string) => {
    if (
      !token ||
      !pickup ||
      !destination ||
      !isPickupAddressBookable(pickup) ||
      destinations.length === 0 ||
      !destinations.every(isDestinationAddressBookable)
    ) {
      invalidateQuote();
      setError('Уточните место подачи. Для назначения можно выбрать точный адрес или населённый пункт');
      return;
    }

    quoteRequestController.current?.abort();
    const requestId = quoteRequestId.current + 1;
    quoteRequestId.current = requestId;
    const controller = new AbortController();
    quoteRequestController.current = controller;
    setQuoteStatus('loading');
    setQuoteRequestPending(true);
    setError(null);

    let localRoute: RouteSummary | null = null;
    if (!demoSession) {
      try {
        localRoute = getOfflineRoadRoute(pickup.coordinates,destinations.map(address=>address.coordinates));
        setRouteCoordinates(localRoute.coordinates);
        setRouteSummary(localRoute);
        setQuoteStatus('offline');
      } catch { /* Outside the bundled road network, wait for the authenticated router. */ }
    }

    try {
      if (demoSession) {
        const route = await getDemoRoadRoute(
          pickup.coordinates,
          destinations.map((item) => item.coordinates),
          controller.signal,
        );
        if (controller.signal.aborted || quoteRequestId.current !== requestId) return;
        const allPointsInGrahovo = [pickup, ...destinations].every(isGrahovoAddress);
        const pricingPoints = billableRoutePoints(pickup, destinations);
        const pricingRoute = pricingPoints[0] === pickup ? route : await getDemoRoadRoute(
          pricingPoints[0]!.coordinates, pricingPoints.slice(1).map(point => point.coordinates), controller.signal,
        );
        if (controller.signal.aborted || quoteRequestId.current !== requestId) return;
        const segments = pricingPoints.slice(1).map((item, index) => ({
          origin: pricingPoints[index]!, destination: item,
          distanceMeters: pricingRoute.segmentDistances[index]!,
          scope: classifyPricingScope(pricingPoints[index]!, item),
        }));
        const pricingScope = classifyMultiStopPricingScope(pickup, destinations);
        const fare = buildTariffs(route.distanceMeters, pricingScope).find(({ code }) => code === 'economy')!;
        setBookingFare({
          ...fare,
          priceMinor: calculateMultiStopFareMinor(
            segments,
            'economy',
            allPointsInGrahovo,
            undefined,
            scheduledAt ? new Date(scheduledAt) : undefined,
          ),
        });
        setRouteCoordinates(route.coordinates);
        setRouteSummary(route);
        setQuoteStatus('ready');
        setError(null);
        return;
      }

      const response = await apiRequest<{
        quoteToken: string;
        tariffs: Tariff[];
        route: RouteSummary;
      }>('/v1/quotes', {
        method: 'POST',
        token,
        body: JSON.stringify({ pickup, destination, destinations, scheduledAt }),
        signal: controller.signal,
      });
      if (quoteRequestId.current !== requestId) return;
      const route = response.route;
      if (!route) {
        setQuoteStatus('error');
        setError('Не удалось рассчитать маршрут');
        return;
      }
      const fare = response.tariffs.find(({ code }) => code === 'economy');
      if (!fare) throw new Error('Не удалось рассчитать стоимость поездки');
      setBookingFare(fare);
      setQuoteToken(response.quoteToken);
      setRouteCoordinates(route.coordinates);
      setRouteSummary(route);
      setQuoteStatus('ready');
      setError(confirmationMessage ?? null);
    } catch (reason) {
      if (controller.signal.aborted || quoteRequestId.current !== requestId) return;
      if (localRoute && isConnectionFailure(reason)) {
        setQuoteStatus('offline');
        setError('Маршрут доступен без интернета. Черновик сохранён. Для стоимости и отправки заказа нужна связь.');
      } else {
        setQuoteStatus('error');
        setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать стоимость');
      }
    } finally {
      if (quoteRequestId.current === requestId) { quoteRequestController.current = null; setQuoteRequestPending(false); }
    }
  }, [
    demoSession,
    destination,
    destinations,
    invalidateQuote,
    pickup,
    scheduledAt,
    token,
  ]);

  useEffect(() => {
    const routeIsBookable =
      !!pickup &&
      !!destination &&
      isPickupAddressBookable(pickup) &&
      destinations.length > 0 &&
      destinations.every(isDestinationAddressBookable);

    if (
      !quoteVisible ||
      !bootstrapReady ||
      !token ||
      currentRide ||
      quoteStatus !== 'idle' ||
      !routeIsBookable
    ) return;

    const timer = setTimeout(() => {
      void requestQuote();
    }, 0);

    return () => clearTimeout(timer);
  }, [
    bootstrapReady,
    currentRide,
    destination,
    destinations,
    pickup,
    quoteStatus,
    quoteVisible,
    requestQuote,
    token,
  ]);

  useEffect(() => {
    if (
      !quoteVisible ||
      demoSession ||
      currentRide ||
      quoteRequestPending ||
      !['ready','offline'].includes(quoteStatus) ||
      !['estimate','offline'].includes(routeSummary?.source ?? '')
    ) return;

    const timer = setTimeout(() => {
      void requestQuote();
    }, ESTIMATED_ROUTE_RETRY_MS);

    return () => clearTimeout(timer);
  }, [currentRide, demoSession, quoteRequestPending, quoteStatus, quoteVisible, requestQuote, routeSummary?.source]);

  useEffect(
    () => () => {
      quoteRequestController.current?.abort();
    },
    [],
  );

  const createDriverOffer = useCallback(async () => {
    if (!demoSession || !isDriver) return null;
    setBusy(true);
    setError(null);
    try {
      const route = await getDemoRoadRoute(
        demoAddresses[0]!.coordinates,
        [demoAddresses[2]!.coordinates],
      );
      const ride = buildDemoDriverOffer({
        route,
        pickup: demoAddresses[0]!,
        destination: demoAddresses[2]!,
        passenger: demoPassenger,
      });
      setDriverOffer(ride);
      setDriverRide((current) =>
        current && isAssignedDriverOrder(current) ? current : ride,
      );
      return ride;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось создать демо-заказ для водителя',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, [demoSession, isDriver]);

  const createRide = useCallback(
    async (comment?: string, legalAcceptance?: InitialLegalAcceptance) => {
      if (!(await checkBooking())) return null;
      if (
        !pickup ||
        !destination ||
        !isPickupAddressBookable(pickup) ||
        !destinations.length ||
        !destinations.every(isDestinationAddressBookable)
      ) {
        setError('Уточните место подачи. Для назначения можно выбрать точный адрес или населённый пункт');
        return null;
      }
      if (quoteStatus !== 'ready' || !routeSummary) {
        setError('Дождитесь расчёта стоимости поездки');
        return null;
      }
      if (demoSession) {
        const now = new Date().toISOString();
        const pricingScope = classifyMultiStopPricingScope(pickup, destinations);
        const ride: RideOrder = {
          id: `ride-${Date.now()}`,
          passengerId: 'demo-passenger',
          pickup,
          destinations,
          destination,
          tariff: 'economy',
          status: 'searching',
          pricingScope,
          basePriceMinor: bookingFare.priceMinor,
          fareRoundingMinor,
          fareRoundingMode,
          searchPriceIncreaseStepMinor: roundFareMinor(defaultPricingRules.searchPriceIncreaseStepMinor),
          priceMinor: bookingFare.priceMinor,
          serviceCommissionMinor: calculateCommissionMinor(bookingFare.priceMinor),
          waitingSeconds: 0,
          waitingPriceMinor: 0,
          waitingFreeMinutes: defaultPricingRules.waitingFreeMinutes,
          waitingPerMinuteMinor: defaultPricingRules.waitingPerMinuteMinor,
          distanceMeters: routeSummary?.distanceMeters ?? 800,
          durationSeconds: routeSummary?.durationSeconds ?? 300,
          routeCoordinates,
          paymentMethod: selectedPaymentMethod,
          comment,
          scheduledAt,
          createdAt: now,
          updatedAt: now,
          passenger: user
            ? {
                ...demoPassenger,
                id: user.id,
                name: user.name,
                phone: user.phone,
              }
            : demoPassenger,
        };
        applyPassengerOrder(ride);
        return ride;
      }
      if (!token || !quoteToken) {
        setError('Расчёт стоимости устарел. Обновите маршрут');
        return null;
      }
      const creationFingerprint = JSON.stringify({
        pickup,
        destinations,
        destination,
        tariff: 'economy',
        paymentMethod: selectedPaymentMethod,
        comment: comment ?? null,
        scheduledAt: scheduledAt ?? null,
      });
      const creationAttempt =
        pendingOrderCreation.current?.fingerprint === creationFingerprint
          ? pendingOrderCreation.current
          : { fingerprint: creationFingerprint, key: idempotencyKey() };
      pendingOrderCreation.current = creationAttempt;
      setBusy(true);
      setError(null);
      try {
        const deviceId = await getInstallationId();
        const ride = await apiRequest<RideOrder>('/v1/orders', {
          method: 'POST',
          token,
          body: JSON.stringify({
            pickup,
            destinations,
            destination,
            tariff: 'economy',
            quoteToken,
            scheduledAt,
            paymentMethod: selectedPaymentMethod,
            comment,
            idempotencyKey: creationAttempt.key,
            deviceId,
            legalAcceptance,
          }),
          timeoutMs: 20_000,
        });
        pendingOrderCreation.current = null;
        applyPassengerOrder(ride);
        if (legalAcceptance) markInitialLegalConsentAccepted();
        return ride;
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === bookingUnavailableCode) showBookingUnavailable();
        if (reason instanceof ApiError && (
          reason.code === 'QUOTE_EXPIRED_OR_INVALID' || reason.code === 'PROMOTION_QUOTE_CHANGED' ||
          reason.code === 'QUOTE_ADDRESS_MISMATCH'
        )) {
          pendingOrderCreation.current = null;
          await requestQuote('Расчёт обновлён. Проверьте стоимость и подтвердите заказ.');
          return null;
        }
        const uncertainFailure =
          reason instanceof ApiError &&
          (reason.code === 'TIMEOUT' || reason.code === 'NETWORK_ERROR' || reason.status >= 500);
        if (uncertainFailure) {
          try {
            const bootstrap = await apiRequest<RideBootstrap>('/v1/bootstrap', {
              token,
              timeoutMs: 8_000,
            });
            const recovered = bootstrap.activePassengerOrder;
            if (recovered) {
              pendingOrderCreation.current = null;
              applyPassengerOrder(recovered);
              setError(null);
              return recovered;
            }
          } catch {
            // Preserve the original creation error; retrying uses the same idempotency key.
          }
        } else {
          pendingOrderCreation.current = null;
        }
        setError(
          uncertainFailure
            ? 'Сервер отвечает дольше обычного. Нажмите ещё раз — повторный заказ не создастся.'
            : reason instanceof Error
              ? reason.message
              : 'Не удалось создать заказ',
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [
      applyPassengerOrder,
      bookingFare,
      checkBooking,
      showBookingUnavailable,
      demoSession,
      destination,
      destinations,
      markInitialLegalConsentAccepted,
      pickup,
      quoteStatus,
      quoteToken,
      scheduledAt,
      requestQuote,
      routeCoordinates,
      routeSummary,
      selectedPaymentMethod,
      token,
      user,
    ],
  );

  const transitionRide = useCallback(
    async (status: RideStatus) => {
      const current = currentRide;
      if (!demoSession || !current || !canTransitionRide(current.status, status)) return;
      const next: RideOrder = {
        ...current,
        status,
        updatedAt: new Date().toISOString(),
        ...demoWaitingTransition(current, status),
        ...(status === 'accepted' || (status === 'driver_arriving' && current.status === 'searching')
          ? {
              driverId: demoDriver.id,
              driver: placeDemoDriverNearPickup(demoDriver, current.pickup.coordinates),
            }
          : {}),
      };
      applyPassengerOrder(next);
    },
    [applyPassengerOrder, currentRide, demoSession],
  );

  const transitionDriverRide = useCallback(
    async (status: RideStatus) => {
      if (transitionInFlight.current) return false;
      const current =
        status === 'accepted' && driverOffer?.status === 'searching'
          ? driverOffer
          : driverRide;
      if (!current || !canTransitionRide(current.status, status)) return false;
      if (demoSession) {
        const acceptingAsNext = status === 'accepted' && Boolean(
          driverRide && isAssignedDriverOrder(driverRide),
        );
        const next: RideOrder = {
          ...current,
          status: status === 'accepted' && !acceptingAsNext ? 'driver_arriving' : status,
          updatedAt: new Date().toISOString(),
          ...demoWaitingTransition(current, status),
          ...(status === 'accepted'
            ? {
                driverId: demoDriver.id,
                driverQueuePosition: acceptingAsNext ? 2 : 1,
                driver: placeDemoDriverNearPickup(demoDriver, current.pickup.coordinates),
              }
            : {}),
        };
        applyDriverOrder(next);
        if (status === 'completed' && nextDriverRide) {
          applyDriverOrder({
            ...nextDriverRide,
            status: 'driver_arriving',
            driverQueuePosition: 1,
            updatedAt: new Date().toISOString(),
          });
        }
        return true;
      }
      if (!token) return false;
      transitionInFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const endpoint =
          current.status === 'searching' && status === 'accepted'
            ? `/v1/driver/orders/${current.id}/accept`
            : `/v1/driver/orders/${current.id}/transition`;
        const ride = await apiRequest<RideOrder>(endpoint, {
          method: 'POST',
          token,
          body: JSON.stringify(
            status === 'accepted'
              ? {}
              : { status },
          ),
        });
        applyDriverOrder(ride);
        if (status === 'completed') await refresh();
        setError(null);
        return true;
      } catch (reason) {
        if (reason instanceof ApiError &&
          (reason.code === 'NETWORK_ERROR' || reason.code === 'TIMEOUT' || reason.status >= 500 || reason.status === 409)) {
          try {
            let recovered: RideOrder | null = null;
            if (status === 'accepted') {
              // Only the authenticated driver's queue can prove acceptance;
              // an admin/driver might otherwise be able to read a rival's order.
              const state = await apiRequest<RideBootstrap>('/v1/bootstrap', { token, timeoutMs: 8_000 });
              recovered = [state.driverQueue.current, state.driverQueue.next].find(ride => ride?.id === current.id) ?? null;
            } else {
              const saved = await apiRequest<RideOrder>(`/v1/orders/${current.id}`, { token, timeoutMs: 8_000 });
              if (saved.driverId && saved.driverId === current.driverId) recovered = saved;
            }
            if (recovered && driverTransitionConfirmed(status, recovered.status)) {
              applyDriverOrder(recovered);
              if (status === 'completed') await refresh();
              setError(null);
              return true;
            }
          } catch { /* Preserve the failed action until the server state can be confirmed. */ }
        }
        setError(reason instanceof Error ? reason.message : 'Не удалось изменить статус');
        await refresh();
        return false;
      } finally {
        transitionInFlight.current = false;
        setBusy(false);
      }
    },
    [applyDriverOrder, demoSession, driverOffer, driverRide, nextDriverRide, refresh, token],
  );

  const completeDriverStop = useCallback(async () => {
    const current = driverRide;
    if (!current || current.status !== 'in_progress' || transitionInFlight.current) return;
    const destinationIndex = current.nextDestinationIndex ?? 0;
    if (destinationIndex >= (current.destinations?.length ?? 1) - 1) return;
    if (demoSession) {
      applyDriverOrder({ ...current, nextDestinationIndex: destinationIndex + 1, updatedAt: new Date().toISOString() });
      return;
    }
    if (!token) return;
    transitionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ride = await apiRequest<RideOrder>(`/v1/driver/orders/${current.id}/stops/complete`, {
        method: 'POST', token, body: JSON.stringify({ destinationIndex }),
      });
      applyDriverOrder(ride);
    } catch (reason) {
      if (reason instanceof ApiError &&
        (reason.code === 'NETWORK_ERROR' || reason.code === 'TIMEOUT' || reason.status >= 500 || reason.status === 409)) {
        try {
          const saved = await apiRequest<RideOrder>(`/v1/orders/${current.id}`, { token, timeoutMs: 8_000, cache: 'no-store' });
          if (saved.driverId && saved.driverId === current.driverId &&
            (saved.status === 'in_progress' || saved.status === 'completed') &&
            (saved.nextDestinationIndex ?? 0) > destinationIndex) {
            applyDriverOrder(saved);
            setError(null);
            return;
          }
        } catch { /* Keep the error if the stop cannot be confirmed on the server. */ }
      }
      setError(reason instanceof Error ? reason.message : 'Не удалось подтвердить остановку');
      await refresh();
    } finally {
      transitionInFlight.current = false;
      setBusy(false);
    }
  }, [applyDriverOrder, demoSession, driverRide, refresh, token]);

  const priceIncreaseInFlight = useRef(false);
  const confirmSearchPriceIncrease = useCallback(async (expectedPriceMinor: number, increaseMinor: number) => {
    const current = currentRide;
    if (!current || priceIncreaseInFlight.current) return false;
    const offerSlot = searchPriceIncreaseOfferSlot(current, Date.now(), 'manual');
    if (offerSlot == null) return false;
    if (current.priceMinor !== expectedPriceMinor || !searchPriceIncreaseChoices(current.priceMinor).includes(increaseMinor)) {
      setError('Проверьте текущую цену и выберите сумму повышения заново');
      return false;
    }
    setError(null);
    if (demoSession) {
      const priceMinor = current.priceMinor + increaseMinor;
      applyPassengerOrder({
        ...current,
        searchPriceIncreaseMinor:
          (current.searchPriceIncreaseMinor ?? 0) + increaseMinor,
        searchPriceIncreaseLastSlot: offerSlot,
        priceMinor,
        serviceCommissionMinor: calculateCommissionMinor(priceMinor),
        updatedAt: new Date().toISOString(),
      });
      return true;
    }
    if (!token) return false;
    priceIncreaseInFlight.current = true;
    setBusy(true);
    try {
      const ride = await apiRequest<RideOrder>(
        `/v1/orders/${current.id}/search-price-increase`,
        { method: 'POST', token, body: JSON.stringify({ choice: { expectedPriceMinor, increaseMinor } }) },
      );
      applyPassengerOrder(ride);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось подтвердить повышение стоимости',
      );
      await refresh();
      return false;
    } finally {
      priceIncreaseInFlight.current = false;
      setBusy(false);
    }
  }, [applyPassengerOrder, currentRide, demoSession, refresh, token]);

  const startWaiting = useCallback(async () => {
    const current = driverRide;
    if (!current || !canControlRideWaiting(current.status) || current.waitingStartedAt || transitionInFlight.current) return;
    if (demoSession) {
      applyDriverOrder({
        ...current,
        waitingStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (!token) return;
    transitionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ride = await apiRequest<RideOrder>(
        `/v1/driver/orders/${current.id}/waiting/start`,
        { method: 'POST', token },
      );
      applyDriverOrder(ride);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось включить ожидание');
    } finally {
      transitionInFlight.current = false;
      setBusy(false);
    }
  }, [applyDriverOrder, demoSession, driverRide, token]);

  const stopWaiting = useCallback(async () => {
    const current = driverRide;
    if (!current || !canControlRideWaiting(current.status) || !current.waitingStartedAt || transitionInFlight.current) return;
    if (demoSession) {
      const waitingSeconds =
        (current.waitingSeconds ?? 0) +
        activeWaitingSeconds(current.waitingStartedAt);
      const waitingPriceMinor = calculateWaitingChargeMinor(
        waitingSeconds,
        current.waitingFreeMinutes,
        current.waitingPerMinuteMinor,
        current.fareRoundingMinor,
        current.fareRoundingMode ?? 'up',
      );
      const priceMinor =
        (current.basePriceMinor ?? current.priceMinor) +
        (current.searchPriceIncreaseMinor ?? 0) +
        waitingPriceMinor;
      applyDriverOrder({
        ...current,
        waitingSeconds,
        waitingPriceMinor,
        waitingStartedAt: undefined,
        priceMinor,
        serviceCommissionMinor: calculateCommissionMinor(priceMinor),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (!token) return;
    transitionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ride = await apiRequest<RideOrder>(
        `/v1/driver/orders/${current.id}/waiting/stop`,
        { method: 'POST', token },
      );
      applyDriverOrder(ride);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось завершить ожидание');
    } finally {
      transitionInFlight.current = false;
      setBusy(false);
    }
  }, [applyDriverOrder, demoSession, driverRide, token]);

  const routeAttempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const addDriverRoutePoint = useCallback(async (kind: DriverRoutePointKind, address: Address) => {
    const current = driverRide;
    if (!token || !current || !driverRouteTarget(current.status) || transitionInFlight.current) {
      throw new Error('Маршрут сейчас нельзя изменить');
    }
    const fingerprint = JSON.stringify([current.id, kind, address]);
    const attempt = routeAttempt.current?.fingerprint === fingerprint ? routeAttempt.current : { fingerprint, id: idempotencyKey() };
    routeAttempt.current = attempt;
    transitionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      let ride: RideOrder;
      if (demoSession) {
        const pickup = current.pickup;
        const destinations = addRideRoutePoint(pickup, current.destinations ?? [current.destination], address, kind);
        if (!destinations) throw new Error('Выберите другую точку маршрута');
        const route = await getDemoRoadRoute(pickup.coordinates, destinations.map(point => point.coordinates));
        const pricingPoints = billableRoutePoints(pickup, destinations);
        const pricingRoute = pricingPoints[0] === pickup ? route : await getDemoRoadRoute(
          pricingPoints[0]!.coordinates, pricingPoints.slice(1).map(point => point.coordinates));
        const basePriceMinor = calculateMultiStopFareMinor(pricingPoints.slice(1).map((point, index) => ({
          origin: pricingPoints[index]!, destination: point, distanceMeters: pricingRoute.segmentDistances[index]!,
          scope: classifyPricingScope(pricingPoints[index]!, point),
        })), current.tariff, [pickup, ...destinations].every(isGrahovoAddress), undefined,
        new Date(current.scheduledAt ?? current.createdAt));
        const priceMinor = basePriceMinor + (current.waitingPriceMinor ?? 0) + (current.searchPriceIncreaseMinor ?? 0);
        ride = { ...current, destinations, destination: destinations[destinations.length - 1]!, routeCoordinates: route.coordinates,
          distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, basePriceMinor, priceMinor,
          serviceCommissionMinor: calculateCommissionMinor(priceMinor), updatedAt: new Date().toISOString() };
      } else {
        ride = await apiRequest<RideOrder>(`/v1/driver/orders/${current.id}/destinations`, {
          method: 'POST', token, timeoutMs: 25_000, body: JSON.stringify({ kind, address, requestId: attempt.id }),
        });
      }
      routeAttempt.current = null;
      applyDriverOrder(ride);
      return ride;
    } finally {
      transitionInFlight.current = false;
      setBusy(false);
    }
  }, [applyDriverOrder, demoSession, driverRide, token]);

  const releaseDriverRide = useCallback(async (reason: string, orderId?: string) => {
    const current = [driverRide, nextDriverRide].find(
      (ride) => ride && (!orderId || ride.id === orderId),
    ) ?? null;
    if (!current || !['accepted', 'driver_arriving', 'driver_waiting'].includes(current.status)) {
      return false;
    }
    if (demoSession) {
      emitRideUpdate({ ...current, status: 'searching', driverId: undefined, driver: undefined, updatedAt: new Date().toISOString() });
      if (current.id === nextDriverRide?.id) setNextDriverRide(null);
      else if (nextDriverRide) {
        setDriverRide({ ...nextDriverRide, driverQueuePosition: 1 });
        setNextDriverRide(null);
      } else setDriverRide(null);
      return true;
    }
    if (!token) return false;
    setBusy(true);
    setError(null);
    try {
      const released = await apiRequest<RideOrder>(`/v1/driver/orders/${current.id}/release`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason }),
      });
      emitRideUpdate(released);
      if (current.id === nextDriverRide?.id) setNextDriverRide(null);
      else setDriverRide(null);
      await refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отказаться от заказа');
      return false;
    } finally {
      setBusy(false);
    }
  }, [demoSession, driverRide, nextDriverRide, refresh, token, emitRideUpdate]);

  const cancelInFlight = useRef(false);
  const cancelRide = useCallback(async (): Promise<boolean> => {
    const current = currentRide;
    if (cancelInFlight.current || !current || ['completed', 'cancelled'].includes(current.status)) return false;
    if (demoSession) {
      applyPassengerOrder({
        ...current,
        status: 'cancelled',
        cancellationCode: 'passenger',
        updatedAt: new Date().toISOString(),
      });
      return true;
    }
    if (!token) return false;
    cancelInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}/cancel`, {
        method: 'POST',
        token,
      });
      applyPassengerOrder(ride);
      setError(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить заказ');
      return false;
    } finally {
      cancelInFlight.current = false;
      setBusy(false);
    }
  }, [applyPassengerOrder, currentRide, demoSession, token]);

  const rateRide = useCallback(
    async (score: number) => {
      const current = currentRide;
      if (!current || current.status !== 'completed' || current.ratings?.byPassenger ||
        !Number.isInteger(score) || score < 1 || score > 5 || passengerRatingInFlight.current) return;
      if (demoSession) {
        applyPassengerOrder({
          ...current,
          ratings: {
            ...current.ratings,
            byPassenger: score,
          },
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      if (!token) return;
      passengerRatingInFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}/rating`, {
          method: 'POST',
          token,
          body: JSON.stringify({ score }),
        });
        applyPassengerOrder(ride);
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === 'RATING_ALREADY_SUBMITTED') {
          try {
            const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}`, { token });
            if (ride.ratings?.byPassenger) { applyPassengerOrder(ride); return; }
          } catch { /* Keep the form for retry until the saved rating is confirmed. */ }
        }
        setError(reason instanceof Error ? reason.message : 'Не удалось отправить оценку');
      } finally {
        passengerRatingInFlight.current = false;
        setBusy(false);
      }
    },
    [applyPassengerOrder, currentRide, demoSession, token],
  );

  const rateDriverRide = useCallback(
    async (score: number) => {
      const current = driverRatingRide;
      if (!current || current.ratings?.byDriver || !Number.isInteger(score) || score < 1 || score > 5 || driverRatingInFlight.current) return;
      if (demoSession) {
        applyDriverOrder({
          ...current,
          ratings: { ...current.ratings, byDriver: score },
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      if (!token) return;
      driverRatingInFlight.current = true;
      setDriverRatingBusy(true);
      setDriverRatingError(null);
      try {
        const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}/rating`, {
          method: 'POST',
          token,
          body: JSON.stringify({ score }),
        });
        applyDriverOrder(ride);
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === 'RATING_ALREADY_SUBMITTED') {
          try {
            const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}`, { token });
            if (ride.ratings?.byDriver) {
              applyDriverOrder(ride);
              return;
            }
          } catch { /* Keep the form available when the saved score cannot be loaded. */ }
        }
        setDriverRatingError(reason instanceof Error ? reason.message : 'Не удалось отправить оценку');
      } finally {
        driverRatingInFlight.current = false;
        setDriverRatingBusy(false);
      }
    },
    [applyDriverOrder, demoSession, driverRatingRide, token],
  );

  const dismissDriverRating = useCallback(() => {
    if (!driverRatingRide || driverRatingInFlight.current) return;
    dispatchDriverRating({ type: 'dismiss', orderId: driverRatingRide.id });
    setDriverRatingError(null);
  }, [driverRatingRide]);

  const resetRide = useCallback(() => {
    pendingOrderCreation.current = null;
    setCurrentRide(null);
    setScheduledAt(undefined);
    setError(null);
    // The completed trip may have consumed a first-trip discount or crossed a
    // fare period. The next booking needs a fresh quote even on the same route.
    invalidateQuote();
  }, [invalidateQuote]);
  const resetDriverRide = useCallback(() => {
    setDriverOffer(null);
    setDriverRide((current) =>
      current?.status === 'searching' ? null : current,
    );
  }, []);
  const value = useMemo(
    () => ({
      pickup,
      destinations,
      destination,
      routeCoordinates,
      routeSummary,
      bookingFare,
      selectedPaymentMethod,
      bookingComment,
      setBookingComment,
      scheduledAt,
      selectScheduledAt,
      currentRide,
      driverRide,
      nextDriverRide,
      driverOffer,
      driverPreorders,
      driverRatingRide,
      driverRatingBusy,
      driverRatingError,
      dismissDriverRating,
      orders,
      adminOrders,
      passengerOrdersHasMore,
      adminOrdersHasMore,
      passengerOrdersLoaded,
      adminOrdersLoaded,
      destinationHistory,
      addressHistory,
      firstRideSuggestions,
      bootstrapReady,
      quoteStatus,
      busy,
      error: error ?? bootstrapError,
      chatUnreadCounts,
      latestIncomingChatMessage,
      subscribeRideUpdates,
      setPickup: selectPickup,
      setDestination: selectDestination,
      setDestinationAt,
      addDestination,
      removeDestination,
      reorderDestinations,
      requestQuote,
      setSelectedPaymentMethod,
      createRide,
      createDriverOffer,
      confirmSearchPriceIncrease,
      transitionRide,
      transitionDriverRide,
      completeDriverStop,
      addDriverRoutePoint,
      startWaiting,
      stopWaiting,
      releaseDriverRide,
      cancelRide,
      rateRide,
      rateDriverRide,
      resetRide,
      resetDriverRide,
      refresh,
      markRideChatRead,
      loadPassengerOrders,
      loadAdminOrders,
      loadMorePassengerOrders,
      loadMoreAdminOrders,
    }),
    [
      busy,
      bootstrapReady,
      cancelRide,
      confirmSearchPriceIncrease,
      createDriverOffer,
      createRide,
      currentRide,
      destinations,
      driverOffer,
      driverPreorders,
      driverRatingRide,
      driverRatingBusy,
      driverRatingError,
      dismissDriverRating,
      driverRide,
      nextDriverRide,
      destination,
      destinationHistory,
      addressHistory,
      firstRideSuggestions,
      quoteStatus,
      routeCoordinates,
      routeSummary,
      selectDestination,
      selectPickup,
      setDestinationAt,
      addDestination,
      removeDestination,
      reorderDestinations,
      requestQuote,
      error,
      bootstrapError,
      chatUnreadCounts,
      latestIncomingChatMessage,
      subscribeRideUpdates,
      adminOrders,
      passengerOrdersHasMore,
      adminOrdersHasMore,
      passengerOrdersLoaded,
      adminOrdersLoaded,
      orders,
      pickup,
      refresh,
      markRideChatRead,
      loadPassengerOrders,
      loadAdminOrders,
      loadMorePassengerOrders,
      loadMoreAdminOrders,
      rateRide,
      rateDriverRide,
      resetRide,
      resetDriverRide,
      bookingFare,
      selectedPaymentMethod,
      bookingComment,
      scheduledAt,
      selectScheduledAt,
      startWaiting,
      stopWaiting,
      addDriverRoutePoint,
      releaseDriverRide,
      transitionDriverRide,
      completeDriverStop,
      transitionRide,
    ],
  );

  const addressValue = useMemo(() => ({
    pickup, destinations, setPickup: selectPickup, setDestination: selectDestination, setDestinationAt, addDestination, destinationHistory, addressHistory, firstRideSuggestions,
  }), [pickup, destinations, selectPickup, selectDestination, setDestinationAt, addDestination, destinationHistory, addressHistory, firstRideSuggestions]);

  return <RideContext.Provider value={value}>
    <RideAddressContext.Provider value={addressValue}>
      <RideBootstrapContext.Provider value={bootstrapReady}>{children}</RideBootstrapContext.Provider>
    </RideAddressContext.Provider>
  </RideContext.Provider>;
}

// Address entry and startup services do not subscribe to GPS, chat or driver
// queue updates. Their context values remain stable when those fields change.
export function useRideAddresses(): RideAddressValue {
  const value = React.use(RideAddressContext);
  if (!value) throw new Error('useRideAddresses must be used inside RideProvider');
  return value;
}

export function useRideBootstrapReady(): boolean { return React.use(RideBootstrapContext); }

export function useRide(): RideContextValue {
  const value = React.use(RideContext);
  if (!value) throw new Error('useRide must be used inside RideProvider');
  return value;
}
