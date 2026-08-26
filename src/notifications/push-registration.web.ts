import { apiRequest } from '@/api/client';

type WebPushConfig = {
  supported: boolean;
  vapidPublicKey: string | null;
};

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export async function syncPushRegistration(
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
  return true;
}
