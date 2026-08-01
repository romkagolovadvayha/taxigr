export const LOCATION_SHARING_STORAGE_KEY = 'taxi_grahovo_share_passenger_location';

// TypeScript fallback. Metro selects the platform-specific implementation.
export async function readStoredLocationSharing(): Promise<boolean> {
  return true;
}

export async function writeStoredLocationSharing(_enabled: boolean): Promise<void> {}
