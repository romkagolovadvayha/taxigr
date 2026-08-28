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
import type { InitialLegalAcceptance } from '@/legal/documents';
import { buildDemoDriverOffer, buildDemoRoute, placeDemoDriverNearPickup } from '@/domain/demo-flow';
import type {
  Address,
  Coordinates,
  PaymentMethod,
  RideOrder,
  RideStatus,
  RouteSummary,
  Tariff,
  TariffCode,
} from '@/domain/models';
import {
  buildTariffs,
  calculateCommissionMinor,
  calculateWaitingChargeMinor,
  classifyPricingScope,
  defaultPricingRules,
} from '@/domain/pricing';
import { canTransitionRide } from '@/domain/ride-state';
import {
  searchPriceIncreaseOfferSlot,
  SEARCH_PRICE_INCREASE_MINOR,
} from '@/domain/search-price-increase';
import { activeWaitingSeconds } from '@/domain/waiting';
import { getInstallationId } from '@/storage/device-id';

type RideContextValue = {
  pickup: Address | null;
  destination: Address | null;
  routeCoordinates: Coordinates[];
  routeSummary: RouteSummary | null;
  tariffs: Tariff[];
  selectedTariff: TariffCode;
  selectedPaymentMethod: PaymentMethod;
  currentRide: RideOrder | null;
  driverRide: RideOrder | null;
  orders: RideOrder[];
  adminOrders: RideOrder[];
  passengerOrdersHasMore: boolean;
  adminOrdersHasMore: boolean;
  destinationHistory: DestinationHistoryItem[];
  quoteStatus: 'idle' | 'loading' | 'ready' | 'error';
  busy: boolean;
  error: string | null;
  setPickup: (address: Address) => void;
  setDestination: (address: Address) => void;
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
  releaseDriverRide: (reason: string) => Promise<boolean>;
  cancelRide: () => Promise<void>;
  rateRide: (score: number) => Promise<void>;
  rateDriverRide: (score: number) => Promise<void>;
  resetRide: () => void;
  resetDriverRide: () => void;
  refresh: () => Promise<void>;
  loadMorePassengerOrders: () => Promise<void>;
  loadMoreAdminOrders: () => Promise<void>;
};

const RideContext = createContext<RideContextValue | null>(null);

function isActive(order: RideOrder): boolean {
  return !['completed', 'cancelled'].includes(order.status);
}

function upsertOrder(orders: RideOrder[], ride: RideOrder): RideOrder[] {
  const exists = orders.some((item) => item.id === ride.id);
  return exists
    ? orders.map((item) => (item.id === ride.id ? ride : item))
    : [ride, ...orders];
}

function appendUniqueOrders(current: RideOrder[], next: RideOrder[]): RideOrder[] {
  const existingIds = new Set(current.map((order) => order.id));
  return [...current, ...next.filter((order) => !existingIds.has(order.id))];
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
  const [destination, setDestination] = useState<Address | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<TariffCode>('economy');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [currentRide, setCurrentRide] = useState<RideOrder | null>(null);
  const [driverRide, setDriverRide] = useState<RideOrder | null>(null);
  const [orders, setOrders] = useState<RideOrder[]>([]);
  const [adminOrders, setAdminOrders] = useState<RideOrder[]>([]);
  const [passengerOrdersHasMore, setPassengerOrdersHasMore] = useState(false);
  const [adminOrdersHasMore, setAdminOrdersHasMore] = useState(false);
  const [tariffs, setTariffs] = useState<Tariff[]>(() =>
    buildTariffs(11_600, 'district'),
  );
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [quoteToken, setQuoteToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRideRef = useRef(currentRide);
  const destinationDefaultToken = useRef<string | null>(null);
  const pendingOrderCreation = useRef<{ fingerprint: string; key: string } | null>(null);
  const transitionInFlight = useRef(false);
  const sessionUserIdRef = useRef(userId);

  useEffect(() => {
    sessionUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  const selectPickup = useCallback((address: Address) => {
    setRouteCoordinates([]);
    setRouteSummary(null);
    setQuoteToken(null);
    setQuoteStatus(hasHouseNumber(address) && hasHouseNumber(destination) ? 'loading' : 'idle');
    setPickup(address);
  }, [destination]);

  const selectDestination = useCallback((address: Address) => {
    setRouteCoordinates([]);
    setRouteSummary(null);
    setQuoteToken(null);
    setQuoteStatus(hasHouseNumber(pickup) && hasHouseNumber(address) ? 'loading' : 'idle');
    setDestination(address);
  }, [pickup]);

  const applyPassengerOrder = useCallback((ride: RideOrder) => {
    setOrders((previous) => upsertOrder(previous, ride));
    setAdminOrders((previous) => upsertOrder(previous, ride));
    setCurrentRide(ride);
    if (ride.routeCoordinates?.length) setRouteCoordinates(ride.routeCoordinates);
  }, []);

  const applyDriverOrder = useCallback((ride: RideOrder) => {
    setDriverRide(ride);
    setAdminOrders((previous) => upsertOrder(previous, ride));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (demoSession) {
        const passengerOrders = userId === demoPassenger.id ? demoOrders : [];
        const demoHistory = buildDestinationHistory(passengerOrders, userId);
        setPickup(null);
        setDestination((current) => current ?? demoHistory.lastDestination);
        setOrders(passengerOrders);
        setAdminOrders(isAdmin ? demoOrders : []);
        setPassengerOrdersHasMore(false);
        setAdminOrdersHasMore(false);
        setCurrentRide(passengerOrders.find(isActive) ?? null);
        setDriverRide(null);
        destinationDefaultToken.current = token;
        return;
      }

      setOrders((items) => items.filter((item) => item.passengerId !== 'demo-passenger'));
      setAdminOrders((items) => items.filter((item) => item.passengerId !== 'demo-passenger'));
      setCurrentRide((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setDriverRide((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setPickup((address) => (address && demoAddresses.some((item) => item.id === address.id) ? null : address));
      setDestination((address) => (address && demoAddresses.some((item) => item.id === address.id) ? null : address));

      if (!token) {
        setPickup(null);
        setDestination(null);
        setOrders([]);
        setAdminOrders([]);
        setPassengerOrdersHasMore(false);
        setAdminOrdersHasMore(false);
        setCurrentRide(null);
        setDriverRide(null);
        destinationDefaultToken.current = null;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [demoSession, isAdmin, token, userId]);

  const refresh = useCallback(async () => {
    if (!token || demoSession) return;
    const sessionUserId = userId;
    try {
      const [passengerOrders, driverOrders, offers, allOrders] = await Promise.all([
        apiRequest<RideOrder[]>('/v1/orders?scope=passenger&limit=50', { token }),
        isDriver
          ? apiRequest<RideOrder[]>('/v1/orders?scope=driver&limit=50', { token })
          : Promise.resolve([]),
        isDriver
          ? apiRequest<RideOrder[]>('/v1/driver/offers', { token })
          : Promise.resolve([]),
        isAdmin
          ? apiRequest<RideOrder[]>('/v1/orders?limit=50', { token })
          : Promise.resolve([]),
      ]);
      if (sessionUserIdRef.current !== sessionUserId) return;
      setOrders(passengerOrders);
      setPassengerOrdersHasMore(passengerOrders.length === 50);
      setCurrentRide(passengerOrders.find(isActive) ?? null);
      setDriverRide(driverOrders.find(isActive) ?? offers[0] ?? null);
      setAdminOrders(allOrders);
      setAdminOrdersHasMore(allOrders.length === 50);
      if (destinationDefaultToken.current !== token) {
        const history = buildDestinationHistory(passengerOrders, userId);
        setDestination((current) => current ?? history.lastDestination);
        destinationDefaultToken.current = token;
      }
    } catch (reason) {
      if (sessionUserIdRef.current !== sessionUserId) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось обновить заказы');
    }
  }, [demoSession, isAdmin, isDriver, token, userId]);

  const loadMorePassengerOrders = useCallback(async () => {
    if (!token || demoSession || !passengerOrdersHasMore) return;
    const cursor = orders.at(-1);
    if (!cursor) return;
    const next = await apiRequest<RideOrder[]>(
      `/v1/orders?scope=passenger&limit=50&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`,
      { token },
    );
    setOrders((current) => appendUniqueOrders(current, next));
    setPassengerOrdersHasMore(next.length === 50);
  }, [demoSession, orders, passengerOrdersHasMore, token]);

  const loadMoreAdminOrders = useCallback(async () => {
    if (!token || demoSession || !isAdmin || !adminOrdersHasMore) return;
    const cursor = adminOrders.at(-1);
    if (!cursor) return;
    const next = await apiRequest<RideOrder[]>(
      `/v1/orders?limit=50&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`,
      { token },
    );
    setAdminOrders((current) => appendUniqueOrders(current, next));
    setAdminOrdersHasMore(next.length === 50);
  }, [adminOrders, adminOrdersHasMore, demoSession, isAdmin, token]);

  useEffect(() => {
    if (!token || demoSession) return;
    const refreshTimer = setTimeout(() => void refresh(), 0);
    const socketUrl = getSocketUrl();
    if (!socketUrl) return () => clearTimeout(refreshTimer);
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 8_000,
    });
    const handleReconnect = () => void refresh();
    socket.io.on('reconnect', handleReconnect);
    socket.on('order:updated', (order: RideOrder) => {
      if (isAdmin) setAdminOrders((previous) => upsertOrder(previous, order));
      if (order.passengerId === userId) applyPassengerOrder(order);
      else if (isDriver && !isAdmin) applyDriverOrder(order);
      else if (isDriver) {
        setDriverRide((current) => (current?.id === order.id ? order : current));
      }
    });
    socket.on('driver:location', (coordinates: Coordinates) => {
      const passengerRideId = currentRideRef.current?.id;
      setCurrentRide((current) =>
        current ? updateDriverCoordinates(current, coordinates) : current,
      );
      if (passengerRideId) {
        setOrders((items) =>
          items.map((item) =>
            item.id === passengerRideId ? updateDriverCoordinates(item, coordinates) : item,
          ),
        );
      }
      setDriverRide((current) =>
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
        setDriverRide((current) => (!current || current.id === order.id ? order : current));
      }
    });
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
      clearTimeout(refreshTimer);
      socket.io.off('reconnect', handleReconnect);
      socket.disconnect();
    };
  }, [
    applyDriverOrder,
    applyPassengerOrder,
    demoSession,
    isAdmin,
    isDriver,
    refresh,
    refreshSession,
    token,
    userId,
  ]);

  useEffect(() => {
    if (!token || demoSession) return;
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
  }, [demoSession, refresh, token]);

  useEffect(() => {
    if (
      !token ||
      !pickup ||
      !destination ||
      !hasHouseNumber(pickup) ||
      !hasHouseNumber(destination)
    ) {
      const idleTimer = setTimeout(() => setQuoteStatus('idle'), 0);
      return () => clearTimeout(idleTimer);
    }
    let active = true;
    const controller = new AbortController();
    const loadingTimer = setTimeout(() => {
      if (!active) return;
      setQuoteStatus('loading');
      setError(null);
    }, 0);
    const timer = setTimeout(() => {
      if (demoSession) {
        const route = buildDemoRoute(pickup, destination);
        setTariffs(buildTariffs(route.distanceMeters, classifyPricingScope(pickup, destination)));
        setRouteCoordinates(route.coordinates);
        setRouteSummary(route);
        setQuoteStatus('ready');
        setError(null);
        return;
      }
      void apiRequest<{
        quoteToken: string;
        tariffs: Tariff[];
        route: RouteSummary;
      }>('/v1/quotes', {
        method: 'POST',
        token,
        body: JSON.stringify({ pickup, destination }),
        signal: controller.signal,
      })
        .then((response) => {
          if (!active) return;
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
        })
        .catch((reason: unknown) => {
          if (!active) return;
          setQuoteStatus('error');
          setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать стоимость');
        });
    }, 250);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(loadingTimer);
      clearTimeout(timer);
    };
  }, [demoSession, destination, pickup, token]);

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
      applyDriverOrder(ride);
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
  }, [applyDriverOrder, demoSession, isDriver]);

  const createRide = useCallback(
    async (comment?: string, legalAcceptance?: InitialLegalAcceptance) => {
      if (!pickup || !destination || !hasHouseNumber(pickup) || !hasHouseNumber(destination)) {
        setError('Укажите номер дома для места подачи и назначения');
        return null;
      }
      if (quoteStatus !== 'ready' || !routeSummary) {
        setError('Дождитесь расчёта стоимости поездки');
        return null;
      }
      const tariff = tariffs.find((item) => item.code === selectedTariff)!;
      if (demoSession) {
        const now = new Date().toISOString();
        const pricingScope = classifyPricingScope(pickup, destination);
        const ride: RideOrder = {
          id: `ride-${Date.now()}`,
          passengerId: 'demo-passenger',
          pickup,
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
            const fetched = await apiRequest<RideOrder[]>('/v1/orders?scope=passenger', {
              token,
              timeoutMs: 8_000,
            });
            setOrders(fetched);
            const recovered = fetched.find(
              (order) => isActive(order) && order.passengerId === userId,
            );
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
      userId,
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
      const current = driverRide;
      if (!current || !canTransitionRide(current.status, status)) return false;
      if (demoSession) {
        let next: RideOrder = {
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
    [applyDriverOrder, demoSession, driverRide, refresh, token],
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

  const releaseDriverRide = useCallback(async (reason: string) => {
    const current = driverRide;
    if (!current || !['accepted', 'driver_arriving', 'driver_waiting'].includes(current.status)) {
      return false;
    }
    if (demoSession) {
      setDriverRide(null);
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
      setDriverRide(null);
      await refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отказаться от заказа');
      return false;
    } finally {
      setBusy(false);
    }
  }, [demoSession, driverRide, refresh, token]);

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
  const resetDriverRide = useCallback(() => setDriverRide(null), []);
  const destinationHistory = useMemo(
    () => buildDestinationHistory(orders, userId).items,
    [orders, userId],
  );

  const value = useMemo(
    () => ({
      pickup,
      destination,
      routeCoordinates,
      routeSummary,
      tariffs,
      selectedTariff,
      selectedPaymentMethod,
      currentRide,
      driverRide,
      orders,
      adminOrders,
      passengerOrdersHasMore,
      adminOrdersHasMore,
      destinationHistory,
      quoteStatus,
      busy,
      error,
      setPickup: selectPickup,
      setDestination: selectDestination,
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
      loadMorePassengerOrders,
      loadMoreAdminOrders,
    }),
    [
      busy,
      cancelRide,
      confirmSearchPriceIncrease,
      createDriverOffer,
      createRide,
      currentRide,
      driverRide,
      destination,
      destinationHistory,
      quoteStatus,
      routeCoordinates,
      routeSummary,
      selectDestination,
      selectPickup,
      error,
      adminOrders,
      passengerOrdersHasMore,
      adminOrdersHasMore,
      orders,
      pickup,
      refresh,
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
