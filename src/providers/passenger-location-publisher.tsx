import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
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

    const publishPosition = (position: Location.LocationObject) => {
      if (cancelled) return;
      lastSharedOrderRef.current = orderId;
      void apiRequest('/v1/passenger/location', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          orderId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        }),
      }).catch(() => undefined);
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
          timeInterval: 10_000,
          distanceInterval: 25,
        },
        publishPosition,
      );
    })().catch(() => undefined);

    return () => {
      cancelled = true;
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
