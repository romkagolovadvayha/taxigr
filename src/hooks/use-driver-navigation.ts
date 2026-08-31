import { useEffect, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

import { apiRequest } from '@/api/client';
import {
  drawableNavigationRoute,
  navigationPositionBucket,
} from '@/domain/navigation';
import type {
  Address,
  Coordinates,
  RideOrder,
  RouteSummary,
} from '@/domain/models';
import {
  driverRouteTarget,
  type DriverRouteTarget,
} from '@/domain/ride-state';

type NavigationRouteResponse = RouteSummary & {
  target?: DriverRouteTarget;
};

type DriverNavigationState = {
  active: boolean;
  targetKind: DriverRouteTarget | null;
  target: Address | null;
  coordinates: Coordinates[];
  summary: RouteSummary | null;
  loading: boolean;
  error: string | null;
};

const NAVIGATION_RETRY_MS = 10_000;
const ESTIMATED_ROUTE_RETRY_MS = 31_000;

export function useDriverNavigation({
  ride,
  origin,
  token,
}: {
  ride: RideOrder | null;
  origin: Coordinates | null;
  token: string | null;
}): DriverNavigationState {
  const demo = token?.startsWith('demo:') ?? false;
  const rideId = ride?.id ?? null;
  const rideStatus = ride?.status ?? null;
  const targetKind = rideStatus ? driverRouteTarget(rideStatus) : null;
  const targetSource =
    ride && targetKind
      ? targetKind === 'pickup'
        ? ride.pickup
        : ride.destination
      : null;
  const target = targetSource;
  const positionBucket = origin ? navigationPositionBucket(origin) : null;
  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const routeKey = rideId && targetKind ? `${rideId}:${targetKind}` : null;
  const routeKeyRef = useRef(routeKey);

  useEffect(
    () => onlineManager.subscribe((online) => {
      if (online) setRetryKey((value) => value + 1);
    }),
    [],
  );

  useEffect(() => {
    const requestOrigin = originRef.current;
    if (!rideId || !requestOrigin || !target || !targetKind || !positionBucket || !token) {
      const timer = setTimeout(() => {
        setSummary(null);
        setCoordinates([]);
        setLoading(false);
        setError(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    const controller = new AbortController();
    const routeChanged = routeKeyRef.current !== routeKey;
    routeKeyRef.current = routeKey;
    const resetTimer = routeChanged
      ? setTimeout(() => {
          setSummary(null);
          setCoordinates([]);
          setError(null);
        }, 0)
      : null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const retryAfter = (delay: number) => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => setRetryKey((value) => value + 1), delay);
    };
    setLoading(true);
    const request = demo
      ? apiRequest<{ route: RouteSummary } | RouteSummary>('/v1/routes/preview', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            pickup: {
              id: 'driver-position',
              label: 'Текущее положение, 1',
              houseNumber: '1',
              coordinates: requestOrigin,
            },
            destination: target,
          }),
        }).then((response) => ('coordinates' in response ? response : response.route))
      : apiRequest<NavigationRouteResponse>(`/v1/driver/orders/${rideId}/route`, {
          method: 'POST',
          token,
          signal: controller.signal,
          body: JSON.stringify(requestOrigin),
        });

    void request
      .then((route) => {
        const nextCoordinates = drawableNavigationRoute(route.coordinates);
        if (nextCoordinates.length >= 2) {
          setSummary(route);
          setCoordinates(nextCoordinates);
          setError(null);
        } else {
          setError('Дорожный маршрут временно недоступен. Повторяем запрос…');
          retryAfter(ESTIMATED_ROUTE_RETRY_MS);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : 'Не удалось построить маршрут',
        );
        retryAfter(NAVIGATION_RETRY_MS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      if (resetTimer) clearTimeout(resetTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [demo, positionBucket, retryKey, rideId, routeKey, target, targetKind, token]);

  return {
    active: Boolean(rideId && origin && targetKind),
    targetKind,
    target,
    coordinates,
    summary,
    loading,
    error,
  };
}
