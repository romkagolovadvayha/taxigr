import * as SecureStore from 'expo-secure-store';
import type { SessionUser } from '../domain/models';

const TOKEN_KEY = 'taxi_grahovo_session_token';
const SNAPSHOT_KEY = 'taxi_grahovo_session_snapshot';
let pendingWrites = Promise.resolve();

function writeInOrder(write: () => Promise<void>): Promise<void> {
  const next = pendingWrites.then(write);
  pendingWrites = next.catch(() => undefined);
  return next;
}

export type StoredSession = { token: string; user: SessionUser; legalConsentRequired?: boolean };

export async function readStoredSession(token: string): Promise<StoredSession | null> {
  try {
    await pendingWrites;
    const raw = process.env.EXPO_OS === 'web'
      ? (typeof window === 'undefined' ? null : window.localStorage.getItem(SNAPSHOT_KEY))
      : await SecureStore.getItemAsync(SNAPSHOT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredSession;
    return value.token === token && typeof value.user?.id === 'string' && typeof value.user.name === 'string' &&
      Array.isArray(value.user.roles) && typeof value.user.profileComplete === 'boolean' ? value : null;
  } catch { return null; }
}

export async function writeStoredSession(session: StoredSession): Promise<void> {
  const raw = JSON.stringify(session);
  await writeInOrder(async () => {
    if (process.env.EXPO_OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(SNAPSHOT_KEY, raw);
      return;
    }
    await SecureStore.setItemAsync(SNAPSHOT_KEY, raw);
  });
}

export async function readSessionToken(): Promise<string | null> {
  await pendingWrites;
  if (process.env.EXPO_OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function writeSessionToken(token: string): Promise<void> {
  await writeInOrder(async () => {
    if (process.env.EXPO_OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  });
}

export async function clearSessionToken(): Promise<void> {
  // A slow secure-store write must finish before logout removes its result.
  await writeInOrder(async () => {
    if (process.env.EXPO_OS === 'web') {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(SNAPSHOT_KEY);
      }
      return;
    }
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(SNAPSHOT_KEY)]);
  });
}
