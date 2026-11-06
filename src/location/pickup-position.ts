import * as Location from 'expo-location';

import type { Coordinates } from '@/domain/models';
import { ensureForegroundLocationPermission } from './foreground-location-permission';

export type PickupPosition = Coordinates | 'denied' | 'unavailable';

export async function requestPickupPosition(signal: AbortSignal): Promise<PickupPosition> {
  const permission = await ensureForegroundLocationPermission();
  if (signal.aborted) return 'unavailable';
  if (!permission.granted) return 'denied';

  const current =
    (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { latitude: current.coords.latitude, longitude: current.coords.longitude };
}
