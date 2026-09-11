import { useEffect, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

import { apiRequest } from '@/api/client';
import { getDemoRoadRoute } from '@/api/demo-routing';
import {
  drawableNavigationRoute,
  navigationPositionBucket,
  navigationTargetsKey,
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
  const nextDestinationIndex = ride?.nextDestinationIndex ?? 0;
  const targetSource =
    ride && targetKind
      ? targetKind === 'pickup'
        ? ride.pickup
        : ride.destinations?.[nextDestinationIndex] ?? ride.destination
      : null;
  const target = targetSource;
  // Order/status refreshes replace address objects even when the road targets
  // have not changed. Rebuild only for changed coordinates/order of stops.
  const targetsKey = target ? navigationTargetsKey(targetKind === 'pickup'
    ? [target] : (ride?.destinations ?? (ride?.destination ? [ride.destination] : [])).slice(nextDestinationIndex)) : null;
  const positionBucket = rideId && targetKind && origin ? navigationPositionBucket(origin) : null;
  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const routeKey = rideId && targetKind && targetsKey ? `${rideId}:${targetKind}:${nextDestinationIndex}:${targetsKey}` : null;
  const routeKeyRef = useRef(routeKey);

  useEffect(() => {
    if (!routeKey) return;
    return onlineManager.subscribe((online) => {
      if (online) setRetryKey((value) => value + 1);
    });
  }, [routeKey]);

  useEffect(() => {
    const requestOrigin = originRef.current;
    if (!rideId || !requestOrigin || !targetsKey || !targetKind || !positionBucket || !token) {
      const timer = setTimeout(() => {
        setSummary(null);
        setCoordinates(current => current.length ? [] : current);
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
      ? getDemoRoadRoute(
          requestOrigin,
          (JSON.parse(targetsKey) as [number, number][]).map(([latitude, longitude]) => ({ latitude, longitude })),
          controller.signal,
        )
      : apiRequest<NavigationRouteResponse>(`/v1/driver/orders/${rideId}/route`, {
          method: 'POST',
          token,
          signal: controller.signal,
          body: JSON.stringify(requestOrigin),
        });

    void request
      .then((route) => {
        if (controller.signal.aborted) return;
        const nextCoordinates = drawableNavigationRoute(route.coordinates);
        if (nextCoordinates.length >= 2 || (route.distanceMeters === 0 && route.durationSeconds === 0)) {
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
  }, [demo, positionBucket, retryKey, rideId, routeKey, targetsKey, targetKind, token]);

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
