import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/api/client';
import type { Coordinates } from '@/domain/models';

type DriverLocationState = {
  coordinates: Coordinates | null;
  heading: number | null;
  speedMetersPerSecond: number | null;
  accuracyMeters: number | null;
  error: string | null;
};

const emptyState: DriverLocationState = {
  coordinates: null,
  heading: null,
  speedMetersPerSecond: null,
  accuracyMeters: null,
  error: null,
};

export function useDriverLocation({
  enabled,
  navigationActive,
  token,
  demoCoordinates,
}: {
  enabled: boolean;
  navigationActive: boolean;
  token: string | null;
  demoCoordinates?: Coordinates | null;
}): DriverLocationState {
  const demo = token?.startsWith('demo:') ?? false;
  const [state, setState] = useState<DriverLocationState>(emptyState);

  useEffect(() => {
    if (!enabled) return;
    if (demo) {
      const timer = setTimeout(() => {
        setState((current) => ({
          ...current,
          coordinates: demoCoordinates ?? current.coordinates,
          error: null,
        }));
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!token) return;

    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    const applyPosition = (position: Location.LocationObject) => {
      if (cancelled) return;
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setState((current) => ({
        coordinates,
        heading:
          position.coords.heading != null && position.coords.heading >= 0
            ? position.coords.heading
            : current.heading,
        speedMetersPerSecond:
          position.coords.speed != null && position.coords.speed >= 0
            ? position.coords.speed
            : current.speedMetersPerSecond,
        accuracyMeters: position.coords.accuracy,
        error: null,
      }));
      void apiRequest('/v1/driver/location', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          ...coordinates,
          accuracyMeters: position.coords.accuracy ?? undefined,
        }),
      }).catch((reason: unknown) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          error:
            reason instanceof Error
              ? reason.message
              : 'Не удалось передать геопозицию',
        }));
      });
    };

    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setState((current) => ({
          ...current,
          error: 'Разрешите геолокацию — без неё навигация водителя не работает',
        }));
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 120_000,
        requiredAccuracy: 200,
      });
      if (lastKnown) applyPosition(lastKnown);

      subscription = await Location.watchPositionAsync(
        navigationActive
          ? {
              accuracy: Location.Accuracy.BestForNavigation,
              timeInterval: 2_000,
              distanceInterval: 5,
              mayShowUserSettingsDialog: true,
            }
          : {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 10_000,
              distanceInterval: 25,
              mayShowUserSettingsDialog: true,
            },
        applyPosition,
        (message) => {
          if (cancelled) return;
          setState((current) => ({ ...current, error: message }));
        },
      );
    })().catch((reason: unknown) => {
      if (cancelled) return;
      setState((current) => ({
        ...current,
        error:
          reason instanceof Error ? reason.message : 'Не удалось включить геолокацию',
      }));
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [demo, demoCoordinates, enabled, navigationActive, token]);

  return state;
}
