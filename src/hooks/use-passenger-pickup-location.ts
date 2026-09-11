import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { resolvePickupAddress } from '@/api/pickup-address';
import { useSession } from '@/auth/session-provider';
import { ensureForegroundLocationPermission } from '@/location/foreground-location-permission';
import { useRide } from '@/state/ride-provider';

export function usePassengerPickupLocation() {
  const { token } = useSession();
  const { setPickup } = useRide();
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationRequest = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => () => {
    locationRequest.current?.abort();
    locationRequest.current = null;
    setLocationLoading(false);
  }, []));

  const selectCurrentLocation = useCallback(async () => {
    if (!token || locationRequest.current) return null;
    const controller = new AbortController();
    locationRequest.current = controller;
    setLocationLoading(true);
    setLocationError(null);
    try {
      const permission = await ensureForegroundLocationPermission();
      if (controller.signal.aborted) return null;
      if (!permission.granted) {
        setLocationError('Разрешите доступ к геопозиции, чтобы определить место подачи');
        return null;
      }
      const current =
        (await Location.getLastKnownPositionAsync({
          maxAge: 60_000,
          requiredAccuracy: 200,
        })) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      if (controller.signal.aborted) return null;
      const coordinates = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      const address = await resolvePickupAddress(coordinates, {
        token,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      if (!address) {
        setLocationError('Геопозиция определена, но адрес найти не удалось. Выберите адрес вручную.');
        return null;
      }
      setPickup(address);
      return address;
    } catch {
      if (controller.signal.aborted) return null;
      setLocationError('Не удалось определить геопозицию. Выберите адрес вручную');
      return null;
    } finally {
      if (locationRequest.current === controller) {
        locationRequest.current = null;
        setLocationLoading(false);
      }
    }
  }, [setPickup, token]);

  return { locationError, locationLoading, selectCurrentLocation };
}
