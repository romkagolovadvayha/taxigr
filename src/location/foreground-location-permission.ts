import * as Location from 'expo-location';

let permissionRequest: Promise<Location.LocationPermissionResponse> | null = null;

export function ensureForegroundLocationPermission(): Promise<Location.LocationPermissionResponse> {
  if (permissionRequest) return permissionRequest;

  permissionRequest = (async () => {
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      if (currentPermission.granted) return currentPermission;
    } catch {
      // Some web browsers cannot inspect permission state before the user action.
    }
    return Location.requestForegroundPermissionsAsync();
  })().finally(() => {
    permissionRequest = null;
  });

  return permissionRequest;
}
