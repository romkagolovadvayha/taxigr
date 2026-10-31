import * as SecureStore from 'expo-secure-store';

const key = 'taxi_grahovo_pending_messenger_login';
export type MessengerAuthProvider = 'max' | 'telegram' | 'vk';
export type MessengerAuthExchange = { challengeId: string; exchangeToken: string };
export type PendingMessengerLogin = {
  provider: MessengerAuthProvider;
  challenge: MessengerAuthExchange;
  expiresAt: number;
};
let writes = Promise.resolve();
const read = () => process.env.EXPO_OS === 'web'
  ? Promise.resolve(typeof window === 'undefined' ? null : window.localStorage.getItem(key))
  : SecureStore.getItemAsync(key);
const write = async (value: string | null) => {
  if (process.env.EXPO_OS === 'web') {
    if (typeof window !== 'undefined') {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
  } else if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
};
function inOrder(action: () => Promise<void>): Promise<void> {
  const next = writes.then(action);
  writes = next.catch(() => undefined);
  return next;
}

export async function savePendingMessengerLogin<T extends MessengerAuthExchange & { expiresInSeconds: number }>(
  provider: MessengerAuthProvider, challenge: T,
): Promise<T> {
  await inOrder(() => write(JSON.stringify({
    provider,
    challenge: {challengeId: challenge.challengeId, exchangeToken: challenge.exchangeToken},
    expiresAt: Date.now() + challenge.expiresInSeconds * 1000,
  })));
  return challenge;
}

export async function readPendingMessengerLogin(): Promise<PendingMessengerLogin | null> {
  try {
    await writes;
    const value = JSON.parse(await read() ?? 'null') as PendingMessengerLogin | null;
    if (!value || !['max', 'telegram', 'vk'].includes(value.provider) ||
      !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() ||
      typeof value.challenge?.challengeId !== 'string' || typeof value.challenge.exchangeToken !== 'string') return null;
    return value;
  } catch { return null; }
}

export function clearPendingMessengerLogin(challengeId?: string): Promise<void> {
  return inOrder(async () => {
    const raw = await read();
    if (challengeId && raw) {
      try { if (JSON.parse(raw)?.challenge?.challengeId !== challengeId) return; } catch { return; }
    }
    await write(null);
  });
}
