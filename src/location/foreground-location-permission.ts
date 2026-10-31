import * as Location from 'expo-location';
import { ensureLocationConsent, type LocationPurpose } from './location-disclosure';

const permissionRequests = new Map<LocationPurpose, Promise<Location.LocationPermissionResponse>>();
const declinedPurposes = new Set<LocationPurpose>();
const deniedPermission = { status: 'denied', granted: false, canAskAgain: true, expires: 'never' } as Location.LocationPermissionResponse;

export function ensureForegroundLocationPermission(
  purpose: LocationPurpose = 'pickup',
  { retryDenied = true }: { retryDenied?: boolean } = {},
): Promise<Location.LocationPermissionResponse> {
  const existing = permissionRequests.get(purpose);
  if (existing) return existing;
  // Automatic tracking restarts on ride transitions. Only a new user action may
  // repeat a declined prompt during this app session (for example going online).
  if (!retryDenied && declinedPurposes.has(purpose)) return Promise.resolve(deniedPermission);

  const permissionRequest = (async () => {
    // OS permission from an older version is not consent to the disclosed use.
    if (!await ensureLocationConsent(purpose)) {
      declinedPurposes.add(purpose);
      return deniedPermission;
    }
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      if (currentPermission.granted) {
        declinedPurposes.delete(purpose);
        return currentPermission;
      }
    } catch {
      // Some web browsers cannot inspect permission state before the user action.
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.granted) declinedPurposes.delete(purpose);
    else declinedPurposes.add(purpose);
    return permission;
  })().finally(() => {
    permissionRequests.delete(purpose);
  });

  permissionRequests.set(purpose, permissionRequest);
  return permissionRequest;
}
