import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'taxi_grahovo_installation_id';

export async function getInstallationId(): Promise<string> {
  if (process.env.EXPO_OS === 'web') {
    if (typeof window === 'undefined') return 'web-server-render';
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = Crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  }

  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return created;
}
