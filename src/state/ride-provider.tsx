import type { ReactNode } from 'react';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { ApiError, apiRequest, getSocketUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { demoAddresses, demoDriver, demoOrders, demoPassenger } from '@/data/demo';
import {
  buildDestinationHistory,
  type DestinationHistoryItem,
} from '@/domain/address-history';
import { hasHouseNumber } from '@/domain/address-precision';
import { isAssignedDriverOrder } from '@/domain/driver-order-queue';
import type { InitialLegalAcceptance } from '@/legal/documents';
import {
  buildDemoDriverOffer,
  buildDemoMultiStopRoute,
  buildDemoRoute,
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
  TariffCode,
} from '@/domain/models';
import {
  buildTariffs,
  calculateCommissionMinor,
  calculateMultiStopFareMinor,
  calculateWaitingChargeMinor,
  classifyMultiStopPricingScope,
  classifyPricingScope,
  defaultPricingRules,
  isGrahovoAddress,
} from '@/domain/pricing';
import { canTransitionRide } from '@/domain/ride-state';
import {
  searchPriceIncreaseOfferSlot,
  SEARCH_PRICE_INCREASE_MINOR,
} from '@/domain/search-price-increase';
import { activeWaitingSeconds } from '@/domain/waiting';
import { getInstallationId } from '@/storage/device-id';

const ESTIMATED_ROUTE_RETRY_MS = 31_000;

type RideContextValue = {
  pickup: Address | null;
  destinations: Address[];
  destination: Address | null;
  routeCoordinates: Coordinates[];
  routeSummary: RouteSummary | null;
  tariffs: Tariff[];
  selectedTariff: TariffCode;
  selectedPaymentMethod: PaymentMethod;
  currentRide: RideOrder | null;
  driverRide: RideOrder | null;
  nextDriverRide: RideOrder | null;
  driverOffer: RideOrder | null;
  orders: RideOrderSummary[];
  adminOrders: RideOrderSummary[];
  passengerOrdersHasMore: boolean;
  adminOrdersHasMore: boolean;
  passengerOrdersLoaded: boolean;
  adminOrdersLoaded: boolean;
  destinationHistory: DestinationHistoryItem[];
  bootstrapReady: boolean;
  quoteStatus: 'idle' | 'loading' | 'ready' | 'error';
  busy: boolean;
  error: string | null;
  chatUnreadCounts: Record<string, number>;
  setPickup: (address: Address) => void;
  setDestination: (address: Address) => void;
  setDestinationAt: (index: number, address: Address) => void;
  addDestination: (address: Address) => void;
  removeDestination: (index: number) => void;
  reorderDestinations: (fromIndex: number, toIndex: number) => void;
  requestQuote: () => Promise<void>;
  setSelectedTariff: (tariff: TariffCode) => void;
  setSelectedPaymentMethod: (method: PaymentMethod) => void;
  createRide: (
    comment?: string,
    legalAcceptance?: InitialLegalAcceptance,
  ) => Promise<RideOrder | null>;
  createDriverOffer: () => Promise<RideOrder | null>;
  confirmSearchPriceIncrease: () => Promise<void>;
  transitionRide: (status: RideStatus) => Promise<void>;
  transitionDriverRide: (status: RideStatus) => Promise<boolean>;
  startWaiting: () => Promise<void>;
  stopWaiting: () => Promise<void>;
  releaseDriverRide: (reason: string, orderId?: string) => Promise<boolean>;
  cancelRide: () => Promise<void>;
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
  driverQueue: {
    current: RideOrder | null;
    next: RideOrder | null;
    offer: RideOrder | null;
  };
  chatUnreadCounts: Record<string, number>;
};

const RideContext = createContext<RideContextValue | null>(null);

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
  return { ...order, driver: { ...order.driver, coordinates } };
}

function idempotencyKey(): string {
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function RideProvider({ children }: { children: ReactNode }) {
  const { token, user, refreshSession, markInitialLegalConsentAccepted } = useSession();
  const demoSession = token?.startsWith('demo:') ?? false;
  const userId = user?.id;
  const isDriver = user?.roles.includes('driver') ?? false;
  const isAdmin = user?.roles.includes('admin') ?? false;
  const [pickup, setPickup] = useState<Address | null>(null);
  const [destinations, setDestinations] = useState<Address[]>([]);
  const destination = destinations.at(-1) ?? null;
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<TariffCode>('economy');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [currentRide, setCurrentRide] = useState<RideOrder | null>(null);
  const [driverRide, setDriverRide] = useState<RideOrder | null>(null);
  const [nextDriverRide, setNextDriverRide] = useState<RideOrder | null>(null);
  const [driverOffer, setDriverOffer] = useState<RideOrder | null>(null);
  const [orders, setOrders] = useState<RideOrderSummary[]>([]);
  const [adminOrders, setAdminOrders] = useState<RideOrderSummary[]>([]);
  const [passengerOrdersHasMore, setPassengerOrdersHasMore] = useState(false);
  const [adminOrdersHasMore, setAdminOrdersHasMore] = useState(false);
  const [passengerOrdersLoaded, setPassengerOrdersLoaded] = useState(false);
  const [adminOrdersLoaded, setAdminOrdersLoaded] = useState(false);
  const [destinationHistory, setDestinationHistory] = useState<DestinationHistoryItem[]>([]);
  const [bootstrappedToken, setBootstrappedToken] = useState<string | null>(null);
  const bootstrapReady = !!token && bootstrappedToken === token;
  const [tariffs, setTariffs] = useState<Tariff[]>(() =>
    buildTariffs(11_600, 'district'),
  );
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [quoteToken, setQuoteToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatUnreadCounts, setChatUnreadCounts] = useState<Record<string, number>>({});
  const quoteRequestController = useRef<AbortController | null>(null);
  const quoteRequestId = useRef(0);
  const completedHistoryOrderIds = useRef(new Set<string>());
  const pendingOrderCreation = useRef<{ fingerprint: string; key: string } | null>(null);
  const transitionInFlight = useRef(false);
  const sessionUserIdRef = useRef(userId);

  useEffect(() => {
    sessionUserIdRef.current = userId;
  }, [userId]);

  const invalidateQuote = useCallback(() => {
    quoteRequestId.current += 1;
    quoteRequestController.current?.abort();
    quoteRequestController.current = null;
    setRouteCoordinates([]);
    setRouteSummary(null);
    setQuoteToken(null);
    setQuoteStatus('idle');
  }, []);

  const selectPickup = useCallback((address: Address) => {
    invalidateQuote();
    setPickup(address);
  }, [invalidateQuote]);

  const selectDestination = useCallback((address: Address) => {
    invalidateQuote();
    setDestinations((current) =>
      current.length ? current.map((item, index) => index === current.length - 1 ? address : item) : [address],
    );
  }, [invalidateQuote]);

  const updateDestinations = useCallback(
    (update: (current: Address[]) => Address[]) => {
      invalidateQuote();
      setDestinations(update);
    },
    [invalidateQuote],
  );

  const setDestinationAt = useCallback(
    (index: number, address: Address) => {
      updateDestinations((current) =>
        current.map((item, itemIndex) => itemIndex === index ? address : item),
      );
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
    const summary = toOrderSummary(ride);
    setOrders((previous) => upsertOrderSummary(previous, summary));
    setAdminOrders((previous) => upsertOrderSummary(previous, summary));
    setCurrentRide(ride);
    if (ride.status === 'completed' && !completedHistoryOrderIds.current.has(ride.id)) {
      completedHistoryOrderIds.current.add(ride.id);
      setDestinationHistory((history) => addCompletedDestination(history, ride));
    }
    if (ride.routeCoordinates?.length) setRouteCoordinates(ride.routeCoordinates);
  }, []);

  const applyDriverOrder = useCallback((ride: RideOrder) => {
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
      setDriverRide((current) => (current?.id === ride.id ? ride : current));
      setNextDriverRide((current) => (current?.id === ride.id ? null : current));
      setDriverOffer((current) => (current?.id === ride.id ? null : current));
    }
    setAdminOrders((previous) => upsertOrderSummary(previous, toOrderSummary(ride)));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (demoSession) {
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

      setOrders((items) => items.filter((item) => item.passengerId !== 'demo-passenger'));
      setAdminOrders((items) => items.filter((item) => item.passengerId !== 'demo-passenger'));
      setCurrentRide((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setDriverRide((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setNextDriverRide((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setDriverOffer((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setPickup((address) => (address && demoAddresses.some((item) => item.id === address.id) ? null : address));
      setDestinations((items) =>
        items.filter((address) => !demoAddresses.some((item) => item.id === address.id)),
      );

      if (!token) {
        setPickup(null);
        setDestinations([]);
        setOrders([]);
        setAdminOrders([]);
        setPassengerOrdersHasMore(false);
        setAdminOrdersHasMore(false);
        setPassengerOrdersLoaded(false);
        setAdminOrdersLoaded(false);
        setDestinationHistory([]);
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
      const bootstrap = await apiRequest<RideBootstrap>('/v1/bootstrap', { token });
      if (sessionUserIdRef.current !== sessionUserId) return;
      setCurrentRide(bootstrap.activePassengerOrder);
      setDriverRide(bootstrap.driverQueue.current ?? bootstrap.driverQueue.offer);
      setNextDriverRide(bootstrap.driverQueue.next);
      setDriverOffer(bootstrap.driverQueue.offer);
      setDestinationHistory(bootstrap.destinationHistory);
      setChatUnreadCounts(bootstrap.chatUnreadCounts);
    } catch (reason) {
      if (sessionUserIdRef.current !== sessionUserId) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось обновить заказы');
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
      void refresh().finally(() => {
        if (active) setBootstrappedToken(token);
      });
    }, 0);
    return () => {
      active = false;
      clearTimeout(bootstrapTimer);
    };
  }, [demoSession, refresh, token]);

  const loadPassengerOrders = useCallback(async () => {
    if (!token || demoSession) return;
    try {
      setError(null);
      const firstPage = await apiRequest<RideOrderSummary[]>(
        '/v1/orders?scope=passenger&view=summary&limit=20',
        { token },
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
    const cursor = orders.at(-1);
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
    const cursor = adminOrders.at(-1);
    if (!cursor) return;
    const next = await apiRequest<RideOrderSummary[]>(
      `/v1/orders?view=summary&limit=20&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`,
      { token },
    );
    setAdminOrders((current) => appendUniqueOrders(current, next));
    setAdminOrdersHasMore(next.length === 20);
  }, [adminOrders, adminOrdersHasMore, demoSession, isAdmin, token]);

  useEffect(() => {
    if (!token || demoSession || !bootstrapReady) return;
    const socketUrl = getSocketUrl();
    if (!socketUrl) return;
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 8_000,
    });
    const handleReconnect = () => void refresh();
    socket.io.on('reconnect', handleReconnect);
    socket.on('order:updated', (order: RideOrder) => {
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
          return {
            ...current,
            passengerCoordinates: payload.coordinates ?? undefined,
          };
        });
      },
    );
    socket.on('order:available', (order: RideOrder) => {
      if (isDriver) {
        setDriverOffer(order);
        setDriverRide((current) =>
          !current || !isAssignedDriverOrder(current) || current.id === order.id
            ? order
            : current,
        );
      }
    });
    socket.on('ride-chat:message', (message: RideChatMessage) => {
      if (message.sender.id === userId) return;
      setChatUnreadCounts((current) => ({
        ...current,
        [message.orderId]: (current[message.orderId] ?? 0) + 1,
      }));
    });
    socket.on(
      'ride-chat:read',
      (payload: { orderId: string; userId: string; unreadCount: number }) => {
        if (payload.userId !== userId) return;
        setChatUnreadCounts((current) => ({
          ...current,
          [payload.orderId]: payload.unreadCount,
        }));
      },
    );
    socket.on('application:updated', () => {
      void refreshSession().catch(() => {
        setError('Статус заявки обновлён. Перезапустите приложение, чтобы обновить доступ.');
      });
    });
    socket.on('account:access-changed', () => {
      void refreshSession().catch(() => {
        setError('Доступ изменён. Перезапустите приложение, чтобы обновить статус.');
      });
    });
    return () => {
      socket.io.off('reconnect', handleReconnect);
      socket.disconnect();
    };
  }, [
    applyDriverOrder,
    applyPassengerOrder,
    bootstrapReady,
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

  const requestQuote = useCallback(async () => {
    if (
      !token ||
      !pickup ||
      !destination ||
      !hasHouseNumber(pickup) ||
      destinations.length === 0 ||
      !destinations.every(hasHouseNumber)
    ) {
      invalidateQuote();
      setError('Укажите номер дома для места подачи и всех точек назначения');
      return;
    }

    quoteRequestController.current?.abort();
    const requestId = quoteRequestId.current + 1;
    quoteRequestId.current = requestId;
    const controller = new AbortController();
    quoteRequestController.current = controller;
    setQuoteStatus('loading');
    setError(null);

    try {
      if (demoSession) {
        const route = buildDemoMultiStopRoute(pickup, destinations);
        const allPointsInGrahovo = [pickup, ...destinations].every(isGrahovoAddress);
        const segments = destinations.map((item, index) => ({
          distanceMeters: route.segmentDistances[index]!,
          scope: classifyPricingScope(index === 0 ? pickup : destinations[index - 1]!, item),
        }));
        const pricingScope = classifyMultiStopPricingScope(pickup, destinations);
        setTariffs(
          buildTariffs(route.distanceMeters, pricingScope).map((tariff) => ({
            ...tariff,
            priceMinor: calculateMultiStopFareMinor(
              segments,
              tariff.code,
              allPointsInGrahovo,
            ),
          })),
        );
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
        body: JSON.stringify({ pickup, destination, destinations }),
        signal: controller.signal,
      });
      if (quoteRequestId.current !== requestId) return;
      const route = response.route;
      if (!route) {
        setQuoteStatus('error');
        setError('Не удалось рассчитать маршрут');
        return;
      }
      setTariffs(response.tariffs);
      setQuoteToken(response.quoteToken);
      setRouteCoordinates(route.coordinates);
      setRouteSummary(route);
      setQuoteStatus('ready');
      setError(null);
    } catch (reason) {
      if (controller.signal.aborted || quoteRequestId.current !== requestId) return;
      setQuoteStatus('error');
      setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать стоимость');
    } finally {
      if (quoteRequestId.current === requestId) quoteRequestController.current = null;
    }
  }, [
    demoSession,
    destination,
    destinations,
    invalidateQuote,
    pickup,
    token,
  ]);

  useEffect(() => {
    const routeIsPrecise =
      !!pickup &&
      !!destination &&
      hasHouseNumber(pickup) &&
      destinations.length > 0 &&
      destinations.every(hasHouseNumber);

    if (
      !bootstrapReady ||
      !token ||
      currentRide ||
      quoteStatus !== 'idle' ||
      !routeIsPrecise
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
    requestQuote,
    token,
  ]);

  useEffect(() => {
    if (
      demoSession ||
      currentRide ||
      quoteStatus !== 'ready' ||
      routeSummary?.source !== 'estimate'
    ) return;

    const timer = setTimeout(() => {
      void requestQuote();
    }, ESTIMATED_ROUTE_RETRY_MS);

    return () => clearTimeout(timer);
  }, [currentRide, demoSession, quoteStatus, requestQuote, routeSummary?.source]);

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
      const route = buildDemoRoute(demoAddresses[0]!, demoAddresses[2]!);
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
      if (
        !pickup ||
        !destination ||
        !hasHouseNumber(pickup) ||
        !destinations.length ||
        !destinations.every(hasHouseNumber)
      ) {
        setError('Укажите номер дома для места подачи и всех точек назначения');
        return null;
      }
      if (quoteStatus !== 'ready' || !routeSummary) {
        setError('Дождитесь расчёта стоимости поездки');
        return null;
      }
      const tariff = tariffs.find((item) => item.code === selectedTariff)!;
      if (demoSession) {
        const now = new Date().toISOString();
        const pricingScope = classifyMultiStopPricingScope(pickup, destinations);
        const ride: RideOrder = {
          id: `ride-${Date.now()}`,
          passengerId: 'demo-passenger',
          pickup,
          destinations,
          destination,
          tariff: selectedTariff,
          status: 'searching',
          pricingScope,
          basePriceMinor: tariff.priceMinor,
          priceMinor: tariff.priceMinor,
          serviceCommissionMinor: calculateCommissionMinor(tariff.priceMinor),
          waitingSeconds: 0,
          waitingPriceMinor: 0,
          waitingFreeMinutes: defaultPricingRules.waitingFreeMinutes,
          waitingPerMinuteMinor: defaultPricingRules.waitingPerMinuteMinor,
          distanceMeters: routeSummary?.distanceMeters ?? 800,
          durationSeconds: routeSummary?.durationSeconds ?? 300,
          routeCoordinates,
          paymentMethod: selectedPaymentMethod,
          comment,
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
        tariff: selectedTariff,
        paymentMethod: selectedPaymentMethod,
        comment: comment ?? null,
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
            tariff: selectedTariff,
            quoteToken,
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
      demoSession,
      destination,
      destinations,
      markInitialLegalConsentAccepted,
      pickup,
      quoteStatus,
      quoteToken,
      routeCoordinates,
      routeSummary,
      selectedTariff,
      selectedPaymentMethod,
      tariffs,
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
        ...(status === 'accepted'
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
        let next: RideOrder = {
          ...current,
          status,
          updatedAt: new Date().toISOString(),
          ...(status === 'accepted'
            ? {
                driverId: demoDriver.id,
                driverQueuePosition: acceptingAsNext ? 2 : 1,
                driver: placeDemoDriverNearPickup(demoDriver, current.pickup.coordinates),
              }
            : {}),
        };
        if (status === 'in_progress' && current.waitingStartedAt) {
          const waitingSeconds =
            (current.waitingSeconds ?? 0) + activeWaitingSeconds(current.waitingStartedAt);
          const waitingPriceMinor = calculateWaitingChargeMinor(
            waitingSeconds,
            current.waitingFreeMinutes,
            current.waitingPerMinuteMinor,
          );
          const priceMinor =
            (current.basePriceMinor ?? current.priceMinor) +
            (current.searchPriceIncreaseMinor ?? 0) +
            waitingPriceMinor;
          next = {
            ...next,
            waitingSeconds,
            waitingPriceMinor,
            waitingStartedAt: undefined,
            priceMinor,
            serviceCommissionMinor: calculateCommissionMinor(priceMinor),
          };
        }
        applyDriverOrder(next);
        if (status === 'completed' && nextDriverRide) {
          applyDriverOrder({
            ...nextDriverRide,
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
              : { status, ...(status === 'completed' ? { paymentReceived: true } : {}) },
          ),
        });
        applyDriverOrder(ride);
        if (status === 'completed') await refresh();
        setError(null);
        return true;
      } catch (reason) {
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

  const confirmSearchPriceIncrease = useCallback(async () => {
    const current = currentRide;
    if (!current) return;
    const offerSlot = searchPriceIncreaseOfferSlot(current);
    if (offerSlot == null) return;
    if (demoSession) {
      const increaseMinor =
        current.searchPriceIncreaseStepMinor ?? SEARCH_PRICE_INCREASE_MINOR;
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
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const ride = await apiRequest<RideOrder>(
        `/v1/orders/${current.id}/search-price-increase`,
        { method: 'POST', token },
      );
      applyPassengerOrder(ride);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось подтвердить повышение стоимости',
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [applyPassengerOrder, currentRide, demoSession, refresh, token]);

  const startWaiting = useCallback(async () => {
    const current = driverRide;
    if (!current || current.status !== 'driver_waiting' || current.waitingStartedAt) return;
    if (demoSession) {
      applyDriverOrder({
        ...current,
        waitingStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (!token) return;
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
      setBusy(false);
    }
  }, [applyDriverOrder, demoSession, driverRide, token]);

  const stopWaiting = useCallback(async () => {
    const current = driverRide;
    if (!current || current.status !== 'driver_waiting' || !current.waitingStartedAt) return;
    if (demoSession) {
      const waitingSeconds =
        (current.waitingSeconds ?? 0) +
        activeWaitingSeconds(current.waitingStartedAt);
      const waitingPriceMinor = calculateWaitingChargeMinor(
        waitingSeconds,
        current.waitingFreeMinutes,
        current.waitingPerMinuteMinor,
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
      await apiRequest(`/v1/driver/orders/${current.id}/release`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason }),
      });
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
  }, [demoSession, driverRide, nextDriverRide, refresh, token]);

  const cancelRide = useCallback(async () => {
    const current = currentRide;
    if (!current || ['completed', 'cancelled'].includes(current.status)) return;
    if (demoSession) {
      applyPassengerOrder({
        ...current,
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}/cancel`, {
        method: 'POST',
        token,
      });
      applyPassengerOrder(ride);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить заказ');
    } finally {
      setBusy(false);
    }
  }, [applyPassengerOrder, currentRide, demoSession, token]);

  const rateRide = useCallback(
    async (score: number) => {
      const current = currentRide;
      if (!current || current.status !== 'completed' || score < 1 || score > 5) return;
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
        setError(reason instanceof Error ? reason.message : 'Не удалось отправить оценку');
      } finally {
        setBusy(false);
      }
    },
    [applyPassengerOrder, currentRide, demoSession, token],
  );

  const rateDriverRide = useCallback(
    async (score: number) => {
      const current = driverRide;
      if (!current || current.status !== 'completed' || score < 1 || score > 5) return;
      if (demoSession) {
        applyDriverOrder({
          ...current,
          ratings: { ...current.ratings, byDriver: score },
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      if (!token) return;
      setBusy(true);
      setError(null);
      try {
        const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}/rating`, {
          method: 'POST',
          token,
          body: JSON.stringify({ score }),
        });
        applyDriverOrder(ride);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Не удалось отправить оценку');
      } finally {
        setBusy(false);
      }
    },
    [applyDriverOrder, demoSession, driverRide, token],
  );

  const resetRide = useCallback(() => {
    pendingOrderCreation.current = null;
    setCurrentRide(null);
  }, []);
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
      tariffs,
      selectedTariff,
      selectedPaymentMethod,
      currentRide,
      driverRide,
      nextDriverRide,
      driverOffer,
      orders,
      adminOrders,
      passengerOrdersHasMore,
      adminOrdersHasMore,
      passengerOrdersLoaded,
      adminOrdersLoaded,
      destinationHistory,
      bootstrapReady,
      quoteStatus,
      busy,
      error,
      chatUnreadCounts,
      setPickup: selectPickup,
      setDestination: selectDestination,
      setDestinationAt,
      addDestination,
      removeDestination,
      reorderDestinations,
      requestQuote,
      setSelectedTariff,
      setSelectedPaymentMethod,
      createRide,
      createDriverOffer,
      confirmSearchPriceIncrease,
      transitionRide,
      transitionDriverRide,
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
      driverRide,
      nextDriverRide,
      destination,
      destinationHistory,
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
      chatUnreadCounts,
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
      selectedTariff,
      selectedPaymentMethod,
      startWaiting,
      stopWaiting,
      releaseDriverRide,
      tariffs,
      transitionDriverRide,
      transitionRide,
    ],
  );

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide(): RideContextValue {
  const value = React.use(RideContext);
  if (!value) throw new Error('useRide must be used inside RideProvider');
  return value;
}
