import * as Location from 'expo-location';

let permissionRequest: Promise<Location.LocationPermissionResponse> | null = null;

export function ensureForegroundLocationPermission(): Promise<Location.LocationPermissionResponse> {
  if (permissionRequest) return permissionRequest;

  permissionRequest = (async () => {
    const currentPermission = await Location.getForegroundPermissionsAsync();
    if (currentPermission.granted) return currentPermission;
    return Location.requestForegroundPermissionsAsync();
  })().finally(() => {
    permissionRequest = null;
  });

  return permissionRequest;
}
