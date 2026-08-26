import { useEffect } from 'react';

import { useSession } from '@/auth/session-provider';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';
import { syncPushRegistration } from '@/notifications/push-registration';

export function NotificationRegistrar() {
  const { token } = useSession();

  useEffect(() => {
    if (
      !token ||
      token.startsWith('demo:') ||
      typeof document === 'undefined' ||
      !('Notification' in window)
    ) return;
    const register = () => {
      if (document.visibilityState !== 'visible' || Notification.permission !== 'granted') return;
      void syncPushRegistration(token).catch((error) =>
        reportCriticalClientError(error, {
          source: 'push-registration',
          token,
          resource: 'web-push',
        }));
    };
    register();
    document.addEventListener('visibilitychange', register);
    window.addEventListener('online', register);
    return () => {
      document.removeEventListener('visibilitychange', register);
      window.removeEventListener('online', register);
    };
  }, [token]);

  return null;
}
