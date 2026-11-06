import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { resolvePickupAddress } from '@/api/pickup-address';
import { useSession } from '@/auth/session-provider';
import { requestPickupPosition } from '@/location/pickup-position';
import { getEmbeddedAppProvider } from '@/mini-apps/runtime';
import { useRideAddresses } from '@/state/ride-provider';

export function usePassengerPickupLocation() {
  const { token } = useSession();
  const { setPickup } = useRideAddresses();
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
      const coordinates = await requestPickupPosition(controller.signal);
      if (controller.signal.aborted) return null;
      if (typeof coordinates === 'string') {
        const provider = getEmbeddedAppProvider();
        setLocationError(coordinates === 'denied' && !provider
          ? 'Разрешите доступ к геопозиции или укажите адрес вручную.'
          : 'Геопозиция недоступна. Укажите адрес вручную.');
        return null;
      }
      const address = await resolvePickupAddress(coordinates, {
        token,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      if (!address) {
        setLocationError('Не удалось определить точку подачи. Укажите адрес вручную.');
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
