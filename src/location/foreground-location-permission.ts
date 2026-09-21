import * as Location from 'expo-location';
import { ensureLocationConsent, type LocationPurpose } from './location-disclosure';

const permissionRequests = new Map<LocationPurpose, Promise<Location.LocationPermissionResponse>>();

export function ensureForegroundLocationPermission(purpose: LocationPurpose = 'pickup'): Promise<Location.LocationPermissionResponse> {
  const existing = permissionRequests.get(purpose);
  if (existing) return existing;

  const permissionRequest = (async () => {
    // OS permission from an older version is not consent to the disclosed use.
    if (!await ensureLocationConsent(purpose)) {
      return { status: 'denied', granted: false, canAskAgain: true, expires: 'never' } as Location.LocationPermissionResponse;
    }
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      if (currentPermission.granted) return currentPermission;
    } catch {
      // Some web browsers cannot inspect permission state before the user action.
    }
    return Location.requestForegroundPermissionsAsync();
  })().finally(() => {
    permissionRequests.delete(purpose);
  });

  permissionRequests.set(purpose, permissionRequest);
  return permissionRequest;
}
