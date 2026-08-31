import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { hasHouseNumber } from '@/domain/address-precision';
import type { Address } from '@/domain/models';
import { useRide } from '@/state/ride-provider';

export function usePassengerPickupLocation() {
  const { token } = useSession();
  const { setPickup } = useRide();
  const [locationLoading, setLocationLoading] = useState(false);

  const selectCurrentLocation = useCallback(async () => {
    if (!token || locationLoading) return;
    setLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const current =
        (await Location.getLastKnownPositionAsync({
          maxAge: 60_000,
          requiredAccuracy: 200,
        })) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      const coordinates = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      const demoSession = token.startsWith('demo:');
      const endpoint = demoSession ? '/v1/addresses/preview' : '/v1/addresses/search';
      const found = await apiRequest<Address[]>(
        `${endpoint}?query=${encodeURIComponent(`${coordinates.longitude},${coordinates.latitude}`)}`,
        { token: demoSession ? undefined : token },
      ).catch(() => []);
      const preciseAddress = found.find(hasHouseNumber);
      if (preciseAddress) setPickup(preciseAddress);
    } catch {
      // The user can still choose the pickup manually when location is unavailable.
    } finally {
      setLocationLoading(false);
    }
  }, [locationLoading, setPickup, token]);

  return { locationLoading, selectCurrentLocation };
}
