export const LOCATION_SHARING_STORAGE_KEY = 'taxi_grahovo_share_passenger_location';

export async function readStoredLocationSharing(): Promise<boolean> {
  try {
    return globalThis.localStorage?.getItem(LOCATION_SHARING_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export async function writeStoredLocationSharing(enabled: boolean): Promise<void> {
  try {
    globalThis.localStorage?.setItem(LOCATION_SHARING_STORAGE_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory setting remains usable.
  }
}
