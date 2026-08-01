import { useEffect, useRef, useState } from 'react';

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
        setSummary(route);
        setCoordinates(
          drawableNavigationRoute(
            route.coordinates,
            requestOrigin,
            target.coordinates,
          ),
        );
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : 'Не удалось построить маршрут',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [demo, positionBucket, rideId, target, targetKind, token]);

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
