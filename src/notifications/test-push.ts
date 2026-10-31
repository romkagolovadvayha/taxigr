import { apiRequest } from '@/api/client';
import { syncPushRegistration } from '@/notifications/push-registration';

const pendingTests = new Map<string, Promise<boolean>>();

/** Register this device for the current account before asking the server to send. */
export function sendTestPush(sessionToken: string, onRegistered?: () => void): Promise<boolean> {
  const pending = pendingTests.get(sessionToken);
  if (pending) return pending;
  const test = (async () => {
    if (!await syncPushRegistration(sessionToken, true)) return false;
    onRegistered?.();
    await apiRequest('/v1/push/test', { method: 'POST', token: sessionToken });
    return true;
  })().finally(() => {
    if (pendingTests.get(sessionToken) === test) pendingTests.delete(sessionToken);
  });
  pendingTests.set(sessionToken, test);
  return test;
}
