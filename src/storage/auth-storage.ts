import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'taxi_grahovo_session_token';

export async function readSessionToken(): Promise<string | null> {
  if (process.env.EXPO_OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function writeSessionToken(token: string): Promise<void> {
  if (process.env.EXPO_OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  if (process.env.EXPO_OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

