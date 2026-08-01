import type { ReactNode } from 'react';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { ApiError, apiRequest, getSocketUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { demoAddresses, demoDriver, demoOrders, demoPassenger } from '@/data/demo';
import {
  buildDestinationHistory,
  type DestinationHistoryItem,
} from '@/domain/address-history';
import { hasHouseNumber } from '@/domain/address-precision';
import { buildDemoDriverOffer, placeDemoDriverNearPickup } from '@/domain/demo-flow';
import type {
  Address,
  Coordinates,
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
import { activeWaitingSeconds } from '@/domain/waiting';
import { getInstallationId } from '@/storage/device-id';

type RideContextValue = {
  pickup: Address | null;
  destination: Address | null;
  routeCoordinates: Coordinates[];
  routeSummary: RouteSummary | null;
  tariffs: Tariff[];
  selectedTariff: TariffCode;
  currentRide: RideOrder | null;
  orders: RideOrder[];
  destinationHistory: DestinationHistoryItem[];
  quoteStatus: 'idle' | 'loading' | 'ready' | 'error';
  busy: boolean;
  error: string | null;
  setPickup: (address: Address) => void;
  setDestination: (address: Address) => void;
  setSelectedTariff: (tariff: TariffCode) => void;
  createRide: (comment?: string) => Promise<RideOrder | null>;
  transitionRide: (status: RideStatus) => Promise<void>;
  startWaiting: () => Promise<void>;
  stopWaiting: () => Promise<void>;
  cancelRide: () => Promise<void>;
  rateRide: (score: number) => Promise<void>;
  resetRide: () => void;
  refresh: () => Promise<void>;
};

const RideContext = createContext<RideContextValue | null>(null);

function isActive(order: RideOrder): boolean {
  return !['completed', 'cancelled'].includes(order.status);
}

function idempotencyKey(): string {
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function RideProvider({ children }: { children: ReactNode }) {
  const { token, user, refreshSession } = useSession();
  const demoSession = token?.startsWith('demo:') ?? false;
  const [pickup, setPickup] = useState<Address | null>(null);
  const [destination, setDestination] = useState<Address | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<TariffCode>('economy');
  const [currentRide, setCurrentRide] = useState<RideOrder | null>(null);
  const [orders, setOrders] = useState<RideOrder[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>(() =>
    buildTariffs(11_600, 'district'),
  );
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destinationDefaultToken = useRef<string | null>(null);
  const pendingOrderCreation = useRef<{ fingerprint: string; key: string } | null>(null);
  const transitionInFlight = useRef(false);

  const selectPickup = useCallback((address: Address) => {
    setRouteCoordinates([]);
    setRouteSummary(null);
    setQuoteStatus(hasHouseNumber(address) && hasHouseNumber(destination) ? 'loading' : 'idle');
    setPickup(address);
  }, [destination]);

  const selectDestination = useCallback((address: Address) => {
    setRouteCoordinates([]);
    setRouteSummary(null);
    setQuoteStatus(hasHouseNumber(pickup) && hasHouseNumber(address) ? 'loading' : 'idle');
    setDestination(address);
  }, [pickup]);

  const applyOrder = useCallback((ride: RideOrder) => {
    setOrders((previous) => {
      const exists = previous.some((item) => item.id === ride.id);
      return exists
        ? previous.map((item) => (item.id === ride.id ? ride : item))
        : [ride, ...previous];
    });
    setCurrentRide(ride);
    if (ride.routeCoordinates?.length) setRouteCoordinates(ride.routeCoordinates);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (demoSession) {
        const demoHistory = buildDestinationHistory(demoOrders, user?.id);
        setPickup(null);
        setDestination((current) => current ?? demoHistory.lastDestination);
        setOrders(demoOrders);
        setCurrentRide(demoOrders.find(isActive) ?? null);
        destinationDefaultToken.current = token;
        return;
      }

      setOrders((items) => items.filter((item) => item.passengerId !== 'demo-passenger'));
      setCurrentRide((ride) => (ride?.passengerId === 'demo-passenger' ? null : ride));
      setPickup((address) => (address && demoAddresses.some((item) => item.id === address.id) ? null : address));
      setDestination((address) => (address && demoAddresses.some((item) => item.id === address.id) ? null : address));

      if (!token) {
        setPickup(null);
        setDestination(null);
        setOrders([]);
        setCurrentRide(null);
        destinationDefaultToken.current = null;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [demoSession, token, user?.id]);

  const refresh = useCallback(async () => {
    if (!token || demoSession) return;
    try {
      const fetched = await apiRequest<RideOrder[]>('/v1/orders', { token });
      setOrders(fetched);
      const active = fetched.find(isActive);
      if (active) {
        setCurrentRide(active);
        return;
      }
      if (destinationDefaultToken.current !== token) {
        const history = buildDestinationHistory(fetched, user?.id);
        setDestination((current) => current ?? history.lastDestination);
        destinationDefaultToken.current = token;
      }
      if (user?.roles.includes('driver')) {
        const offers = await apiRequest<RideOrder[]>('/v1/driver/offers', { token });
        setCurrentRide(offers[0] ?? null);
      } else {
        setCurrentRide(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось обновить заказы');
    }
  }, [demoSession, token, user]);

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
    socket.on('order:updated', (order: RideOrder) => applyOrder(order));
    socket.on('driver:location', (coordinates: Coordinates) => {
      setCurrentRide((current) => {
        if (!current?.driver) return current;
        const next = { ...current, driver: { ...current.driver, coordinates } };
        setOrders((items) => items.map((item) => (item.id === next.id ? next : item)));
        return next;
      });
    });
    socket.on(
      'passenger:location',
      (payload: { orderId: string; coordinates: Coordinates | null }) => {
        setCurrentRide((current) => {
          if (!current || current.id !== payload.orderId) return current;
          const next = {
            ...current,
            passengerCoordinates: payload.coordinates ?? undefined,
          };
          setOrders((items) => items.map((item) => (item.id === next.id ? next : item)));
          return next;
        });
      },
    );
    socket.on('order:available', (order: RideOrder) => {
      if (user?.roles.includes('driver')) setCurrentRide((current) => current ?? order);
    });
    socket.on('application:updated', () => {
      void refreshSession().catch(() => {
        setError('Статус заявки обновлён. Перезапустите приложение, чтобы обновить доступ.');
      });
    });
    return () => {
      clearTimeout(refreshTimer);
      socket.io.off('reconnect', handleReconnect);
      socket.disconnect();
    };
  }, [applyOrder, demoSession, refresh, refreshSession, token, user?.roles]);

  useEffect(() => {
    if (!token || demoSession) return;
    let previousState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = nextState === 'active' && previousState !== 'active';
      previousState = nextState;
      if (returnedToForeground) void refresh();
    });
    const handleOnline = () => void refresh();
    if (typeof window !== 'undefined') window.addEventListener('online', handleOnline);
    return () => {
      appStateSubscription.remove();
      if (typeof window !== 'undefined') window.removeEventListener('online', handleOnline);
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
    const loadingTimer = setTimeout(() => {
      if (!active) return;
      setQuoteStatus('loading');
      setError(null);
    }, 0);
    const timer = setTimeout(() => {
      const endpoint = demoSession ? '/v1/routes/preview' : '/v1/quotes';
      void apiRequest<{ tariffs?: Tariff[]; route?: RouteSummary } | RouteSummary>(endpoint, {
        method: 'POST',
        token: demoSession ? undefined : token,
        body: JSON.stringify({ pickup, destination }),
      })
        .then((response) => {
          if (!active) return;
          const route = 'coordinates' in response ? response : response.route;
          if (!route) {
            setQuoteStatus('error');
            setError('Не удалось рассчитать маршрут');
            return;
          }
          if ('tariffs' in response && response.tariffs) setTariffs(response.tariffs);
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
      clearTimeout(loadingTimer);
      clearTimeout(timer);
    };
  }, [demoSession, destination, pickup, token]);

  const createRide = useCallback(
    async (comment?: string) => {
      if (demoSession && user?.roles.includes('driver')) {
        setBusy(true);
        setError(null);
        try {
          const response = await apiRequest<
            RouteSummary | { route: RouteSummary }
          >('/v1/routes/preview', {
            method: 'POST',
            body: JSON.stringify({
              pickup: demoAddresses[0]!,
              destination: demoAddresses[2]!,
            }),
          });
          const route = 'coordinates' in response ? response : response.route;
          const ride = buildDemoDriverOffer({
            route,
            pickup: demoAddresses[0]!,
            destination: demoAddresses[2]!,
            passenger: demoPassenger,
          });
          applyOrder(ride);
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
      }
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
          paymentMethod: 'direct',
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
        applyOrder(ride);
        return ride;
      }
      if (!token) return null;
      const creationFingerprint = JSON.stringify({
        pickup,
        destination,
        tariff: selectedTariff,
        paymentMethod: 'direct',
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
            paymentMethod: 'direct',
            comment,
            idempotencyKey: creationAttempt.key,
            deviceId,
          }),
          timeoutMs: 20_000,
        });
        pendingOrderCreation.current = null;
        applyOrder(ride);
        return ride;
      } catch (reason) {
        const uncertainFailure =
          reason instanceof ApiError &&
          (reason.code === 'TIMEOUT' || reason.code === 'NETWORK_ERROR' || reason.status >= 500);
        if (uncertainFailure) {
          try {
            const fetched = await apiRequest<RideOrder[]>('/v1/orders', {
              token,
              timeoutMs: 8_000,
            });
            setOrders(fetched);
            const recovered = fetched.find(
              (order) => isActive(order) && order.passengerId === user?.id,
            );
            if (recovered) {
              pendingOrderCreation.current = null;
              applyOrder(recovered);
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
      applyOrder,
      demoSession,
      destination,
      pickup,
      quoteStatus,
      routeCoordinates,
      routeSummary,
      selectedTariff,
      tariffs,
      token,
      user,
    ],
  );

  const transitionRide = useCallback(
    async (status: RideStatus) => {
      if (transitionInFlight.current) return;
      const current = currentRide;
      if (!current || !canTransitionRide(current.status, status)) return;
      if (demoSession) {
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
        applyOrder(next);
        return;
      }
      if (!token) return;
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
          body: JSON.stringify(status === 'accepted' ? {} : { status }),
        });
        applyOrder(ride);
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Не удалось изменить статус');
        await refresh();
      } finally {
        transitionInFlight.current = false;
        setBusy(false);
      }
    },
    [applyOrder, currentRide, demoSession, refresh, token],
  );

  const startWaiting = useCallback(async () => {
    const current = currentRide;
    if (!current || current.status !== 'in_progress' || current.waitingStartedAt) return;
    if (demoSession) {
      applyOrder({
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
      applyOrder(ride);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось включить ожидание');
    } finally {
      setBusy(false);
    }
  }, [applyOrder, currentRide, demoSession, token]);

  const stopWaiting = useCallback(async () => {
    const current = currentRide;
    if (!current || current.status !== 'in_progress' || !current.waitingStartedAt) return;
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
        (current.basePriceMinor ?? current.priceMinor) + waitingPriceMinor;
      applyOrder({
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
      applyOrder(ride);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось завершить ожидание');
    } finally {
      setBusy(false);
    }
  }, [applyOrder, currentRide, demoSession, token]);

  const cancelRide = useCallback(async () => {
    const current = currentRide;
    if (!current || ['completed', 'cancelled'].includes(current.status)) return;
    if (demoSession) {
      applyOrder({ ...current, status: 'cancelled', updatedAt: new Date().toISOString() });
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      const ride = await apiRequest<RideOrder>(`/v1/orders/${current.id}/cancel`, {
        method: 'POST',
        token,
      });
      applyOrder(ride);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить заказ');
    } finally {
      setBusy(false);
    }
  }, [applyOrder, currentRide, demoSession, token]);

  const rateRide = useCallback(
    async (score: number) => {
      const current = currentRide;
      if (!current || current.status !== 'completed' || score < 1 || score > 5) return;
      if (demoSession) {
        const actingAsDriver =
          !!current.driverId &&
          !!user?.roles.includes('driver') &&
          current.passengerId !== user.id;
        applyOrder({
          ...current,
          ratings: {
            ...current.ratings,
            ...(actingAsDriver ? { byDriver: score } : { byPassenger: score }),
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
        applyOrder(ride);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Не удалось отправить оценку');
      } finally {
        setBusy(false);
      }
    },
    [applyOrder, currentRide, demoSession, token, user],
  );

  const resetRide = useCallback(() => {
    pendingOrderCreation.current = null;
    setCurrentRide(null);
  }, []);
  const destinationHistory = useMemo(
    () => buildDestinationHistory(orders, user?.id).items,
    [orders, user?.id],
  );

  const value = useMemo(
    () => ({
      pickup,
      destination,
      routeCoordinates,
      routeSummary,
      tariffs,
      selectedTariff,
      currentRide,
      orders,
      destinationHistory,
      quoteStatus,
      busy,
      error,
      setPickup: selectPickup,
      setDestination: selectDestination,
      setSelectedTariff,
      createRide,
      transitionRide,
      startWaiting,
      stopWaiting,
      cancelRide,
      rateRide,
      resetRide,
      refresh,
    }),
    [
      busy,
      cancelRide,
      createRide,
      currentRide,
      destination,
      destinationHistory,
      quoteStatus,
      routeCoordinates,
      routeSummary,
      selectDestination,
      selectPickup,
      error,
      orders,
      pickup,
      refresh,
      rateRide,
      resetRide,
      selectedTariff,
      startWaiting,
      stopWaiting,
      tariffs,
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
