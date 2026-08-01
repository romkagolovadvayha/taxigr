import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import {
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
  liveLocationUpdateDelay,
} from '@/domain/live-location';
import { usePassengerPreferences } from '@/preferences/passenger-preferences-provider';
import { useRide } from '@/state/ride-provider';

const SHAREABLE_STATUSES = new Set([
  'accepted',
  'driver_arriving',
  'driver_waiting',
  'in_progress',
]);

export function PassengerLocationPublisher() {
  const { token, user } = useSession();
  const { currentRide } = useRide();
  const { shareLocationWithDriver } = usePassengerPreferences();
  const lastSharedOrderRef = useRef<string | null>(null);
  const demoSession = token?.startsWith('demo:') ?? false;
  const orderId = currentRide?.id;
  const passengerOwnsRide = !!currentRide && currentRide.passengerId === user?.id;
  const canShare =
    !!token &&
    !demoSession &&
    shareLocationWithDriver &&
    passengerOwnsRide &&
    !!currentRide?.driverId &&
    SHAREABLE_STATUSES.has(currentRide.status);

  useEffect(() => {
    if (canShare || !token) return;
    const orderId = lastSharedOrderRef.current;
    if (!orderId) return;
    lastSharedOrderRef.current = null;
    void apiRequest(`/v1/passenger/location/${orderId}`, {
      method: 'DELETE',
      token,
    }).catch(() => undefined);
  }, [canShare, token]);

  useEffect(() => {
    if (!canShare || !token || !orderId) return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    let lastPublishedAt = 0;
    let pendingPosition: Location.LocationObject | null = null;
    let trailingTimer: ReturnType<typeof setTimeout> | undefined;
    let publishInFlight = false;
    let queuedPayload: {
      orderId: string;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
    } | null = null;
    const requestController = new AbortController();

    const publishLatest = () => {
      if (cancelled || publishInFlight || !queuedPayload) return;
      const payload = queuedPayload;
      queuedPayload = null;
      publishInFlight = true;
      void apiRequest('/v1/passenger/location', {
        method: 'PUT',
        token,
        signal: requestController.signal,
        body: JSON.stringify(payload),
      })
        .catch(() => undefined)
        .finally(() => {
          publishInFlight = false;
          if (!cancelled && queuedPayload) publishLatest();
        });
    };

    const commitPosition = (position: Location.LocationObject) => {
      if (cancelled) return;
      lastPublishedAt = Date.now();
      pendingPosition = null;
      lastSharedOrderRef.current = orderId;
      queuedPayload = {
        orderId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
      };
      publishLatest();
    };

    const publishPosition = (position: Location.LocationObject) => {
      if (cancelled) return;
      pendingPosition = position;
      const delay = liveLocationUpdateDelay(lastPublishedAt, Date.now());
      if (delay === 0) {
        if (trailingTimer) clearTimeout(trailingTimer);
        trailingTimer = undefined;
        commitPosition(position);
        return;
      }
      if (trailingTimer) return;
      trailingTimer = setTimeout(() => {
        trailingTimer = undefined;
        if (pendingPosition) commitPosition(pendingPosition);
      }, delay);
    };

    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      publishPosition(
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      );
      if (cancelled) return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LIVE_LOCATION_UPDATE_INTERVAL_MS,
          distanceInterval: 25,
        },
        publishPosition,
      );
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      requestController.abort();
      if (trailingTimer) clearTimeout(trailingTimer);
      subscription?.remove();
    };
  }, [canShare, orderId, token]);

  useEffect(
    () => () => {
      const orderId = lastSharedOrderRef.current;
      if (!orderId || !token) return;
      void apiRequest(`/v1/passenger/location/${orderId}`, {
        method: 'DELETE',
        token,
      }).catch(() => undefined);
    },
    [token],
  );

  return null;
}
