import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { apiRequest } from '@/api/client';
import {
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
  liveLocationUpdateDelay,
} from '@/domain/live-location';
import type { Coordinates } from '@/domain/models';
import { syncDriverBackgroundLocation } from '@/location/driver-background-location';

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
  enabled: boolean | null;
  navigationActive: boolean;
  token: string | null;
  demoCoordinates?: Coordinates | null;
}): DriverLocationState {
  const demo = token?.startsWith('demo:') ?? false;
  const [state, setState] = useState<DriverLocationState>(emptyState);
  const lastRenderedRef = useRef<{ token: string; at: number } | null>(null);
  const lastPublishedRef = useRef<{ token: string; at: number } | null>(null);

  useEffect(() => {
    // `null` means that the server status is still loading. Do not stop an
    // already running background task just because the screen remounted.
    if (demo || enabled !== false) return;
    void syncDriverBackgroundLocation(false).catch(() => undefined);
  }, [demo, enabled]);

  useEffect(() => {
    if (enabled !== true || !demo) return;
    const timer = setTimeout(() => {
      setState((current) => ({
        ...current,
        coordinates: demoCoordinates ?? current.coordinates,
        error: null,
      }));
    }, 0);
    return () => clearTimeout(timer);
  }, [demo, demoCoordinates, enabled]);

  useEffect(() => {
    if (enabled !== true || demo || !token) return;

    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    let pendingPosition: Location.LocationObject | null = null;
    let trailingTimer: ReturnType<typeof setTimeout> | undefined;
    let publishInFlight = false;
    let backgroundWarning: string | null = null;
    let queuedPublish: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
    } | null = null;
    const requestController = new AbortController();

    const publishLatest = () => {
      if (cancelled || publishInFlight || !queuedPublish) return;
      const payload = queuedPublish;
      queuedPublish = null;
      publishInFlight = true;
      void apiRequest('/v1/driver/location', {
        method: 'PUT',
        token,
        signal: requestController.signal,
        body: JSON.stringify(payload),
      })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setState((current) => ({
            ...current,
            error:
              reason instanceof Error
                ? reason.message
                : 'Не удалось передать геопозицию',
          }));
        })
        .finally(() => {
          publishInFlight = false;
          if (!cancelled && queuedPublish) publishLatest();
        });
    };

    const commitPosition = (position: Location.LocationObject) => {
      if (cancelled) return;
      const now = Date.now();
      lastRenderedRef.current = { token, at: now };
      pendingPosition = null;
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
        error: backgroundWarning,
      }));
      const lastPublished = lastPublishedRef.current;
      if (
        lastPublished?.token === token &&
        liveLocationUpdateDelay(lastPublished.at, now) > 0
      ) {
        return;
      }
      lastPublishedRef.current = { token, at: now };
      queuedPublish = {
        ...coordinates,
        accuracyMeters: position.coords.accuracy ?? undefined,
      };
      publishLatest();
    };

    const applyPosition = (position: Location.LocationObject) => {
      if (cancelled) return;
      pendingPosition = position;
      const lastRendered = lastRenderedRef.current;
      const delay =
        lastRendered?.token === token
          ? liveLocationUpdateDelay(lastRendered.at, Date.now())
          : 0;
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
      if (!permission.granted) {
        setState((current) => ({
          ...current,
          error: 'Разрешите геолокацию — без неё навигация водителя не работает',
        }));
        return;
      }

      const backgroundEnabled = await syncDriverBackgroundLocation(true);
      if (!backgroundEnabled) {
        backgroundWarning = 'Разрешите геолокацию «Всегда», чтобы заказы и маршрут работали при свёрнутом приложении';
        setState((current) => ({
          ...current,
          error: backgroundWarning,
        }));
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 120_000,
        requiredAccuracy: 200,
      });
      if (lastKnown) applyPosition(lastKnown);

      subscription = await Location.watchPositionAsync(
        navigationActive
          ? {
              accuracy:
                Platform.OS === 'web'
                  ? Location.Accuracy.High
                  : Location.Accuracy.BestForNavigation,
              timeInterval: LIVE_LOCATION_UPDATE_INTERVAL_MS,
              distanceInterval: 10,
              mayShowUserSettingsDialog: true,
            }
          : {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: LIVE_LOCATION_UPDATE_INTERVAL_MS,
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
      requestController.abort();
      if (trailingTimer) clearTimeout(trailingTimer);
      subscription?.remove();
    };
  }, [demo, enabled, navigationActive, token]);

  return state;
}
