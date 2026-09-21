import * as SecureStore from 'expo-secure-store';

// Old values included default-on sharing and cannot prove explicit consent.
export const LOCATION_SHARING_STORAGE_KEY = 'taxi_grahovo_share_passenger_location_consent_v2';

export async function readStoredLocationSharing(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(LOCATION_SHARING_STORAGE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function writeStoredLocationSharing(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(LOCATION_SHARING_STORAGE_KEY, String(enabled));
  } catch {
    // A preference write must never prevent the app from working.
  }
}
