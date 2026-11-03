import { apiRequest } from '@/api/client';

type WebPushConfig = {
  supported: boolean;
  vapidPublicKey: string | null;
};

const registrations = new Map<string, { promise: Promise<boolean>; requestPermission: boolean }>();
let successfulRegistration: { token: string; at: number } | undefined;
const REGISTRATION_REFRESH_MS = 5 * 60_000;

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function registerDevice(
  sessionToken: string,
  requestPermission = false,
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    throw new Error('Браузер не поддерживает Web Push или сайт открыт без HTTPS.');
  }
  const permission = Notification.permission === 'default' && requestPermission
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') return false;
  if (!requestPermission && successfulRegistration?.token === sessionToken &&
      Date.now() - successfulRegistration.at < REGISTRATION_REFRESH_MS) return true;
  const config = await apiRequest<WebPushConfig>('/v1/push/config', { token: sessionToken });
  if (!config.supported || !config.vapidPublicKey) {
    throw new Error('Web Push не настроен на сервере.');
  }
  const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(config.vapidPublicKey),
  });
  const serialized = subscription.toJSON();
  await apiRequest('/v1/web-push-subscriptions', {
    method: 'PUT',
    token: sessionToken,
    body: JSON.stringify({
      endpoint: serialized.endpoint,
      expirationTime: serialized.expirationTime ?? null,
      keys: serialized.keys,
    }),
  });
  successfulRegistration = { token: sessionToken, at: Date.now() };
  return true;
}

export function syncPushRegistration(sessionToken: string, requestPermission = false): Promise<boolean> {
  const pending = registrations.get(sessionToken);
  if (pending) {
    if (!requestPermission || pending.requestPermission) return pending.promise;
    return pending.promise.catch(() => false).then(registered => registered || syncPushRegistration(sessionToken, true));
  }
  const promise = registerDevice(sessionToken, requestPermission).finally(() => {
    if (registrations.get(sessionToken)?.promise === promise) registrations.delete(sessionToken);
  });
  registrations.set(sessionToken, { promise, requestPermission });
  return promise;
}
