import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { apiRequest } from '@/api/client';
import { pickupAddressAtCoordinates, resolvePickupAddress } from '@/api/pickup-address';
import { useSession } from '@/auth/session-provider';
import { hasHouseNumber } from '@/domain/address-precision';
import type { Address } from '@/domain/models';
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
      let address = await resolvePickupAddress(coordinates, {
        apiKey: process.env.EXPO_PUBLIC_YANDEX_GEOCODER_API_KEY,
        signal: controller.signal,
        referer: Platform.OS === 'web' ? undefined : 'https://taxigr.ru/',
      });
      if (controller.signal.aborted) return null;
      if (!address) {
        const demoSession = token.startsWith('demo:');
        const endpoint = demoSession ? '/v1/addresses/preview' : '/v1/addresses/search';
        const found = await apiRequest<Address[]>(
          `${endpoint}?query=${encodeURIComponent(`${coordinates.longitude},${coordinates.latitude}`)}`,
          { token: demoSession ? undefined : token, signal: controller.signal, timeoutMs: 5_000 },
        ).catch(() => []);
        const candidates = Array.isArray(found) ? found : [];
        const nearest = candidates.find(hasHouseNumber) ?? candidates.find((item) => item.label?.trim());
        if (nearest) address = pickupAddressAtCoordinates(nearest, coordinates);
      }
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
