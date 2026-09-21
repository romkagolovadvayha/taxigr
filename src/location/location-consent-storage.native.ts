import * as SecureStore from 'expo-secure-store';

const key = (purpose: string) => `taxigr_location_consent_20260922_${purpose}`;

export async function readLocationConsent(purpose: string): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(key(purpose))) === 'accepted'; }
  catch { return false; }
}

export async function writeLocationConsent(purpose: string): Promise<void> {
  // If consent cannot be saved, callers must not start persistent background access.
  await SecureStore.setItemAsync(key(purpose), 'accepted');
}
