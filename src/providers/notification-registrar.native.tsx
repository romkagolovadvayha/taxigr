import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';
import { syncPushRegistration } from '@/notifications/push-registration';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // Ride status sounds are handled by RideFeedbackProvider. Chat has no separate
    // in-app sound, so let its foreground push use the configured channel sound.
    shouldPlaySound: notification.request.content.data?.chat === 'true',
    shouldSetBadge: false,
  }),
});

export function NotificationRegistrar() {
  const { token } = useSession();
  const router = useRouter();
  const initialResponseHandled = useRef(false);

  useEffect(() => {
    if (!token || token.startsWith('demo:')) return;
    const openOrder = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      const orderId = typeof data?.orderId === 'string' ? data.orderId : null;
      if (!orderId) return;
      if (data?.chat === 'true') {
        router.push({ pathname: '/chat/[id]', params: { id: orderId } } as never);
        return;
      }
      const role = data?.role === 'driver' ? 'driver' : 'passenger';
      router.push({
        pathname: role === 'driver' ? '/driver/trips/[id]' : '/orders/[id]',
        params: { id: orderId },
      } as never);
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openOrder);
    if (!initialResponseHandled.current) {
      initialResponseHandled.current = true;
      void Notifications.getLastNotificationResponseAsync().then(openOrder).catch(() => undefined);
    }
    return () => responseSubscription.remove();
  }, [router, token]);

  useEffect(() => {
    if (!token || token.startsWith('demo:')) return;
    let active = true;
    const register = async () => {
      if (!active) return;
      // Registration must not trigger the Android permission dialog by itself.
      // The user requests it explicitly from the notification settings switch.
      await syncPushRegistration(token);
    };
    const retryRegistration = () => void register().catch((error) => {
      void reportCriticalClientError(error, {
        source: 'push-registration',
        token,
        resource: 'expo-notifications',
      });
      // Registration is retried when the app becomes active again.
    });
    retryRegistration();
    const pushTokenSubscription = Notifications.addPushTokenListener(retryRegistration);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryRegistration();
    });

    return () => {
      active = false;
      pushTokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [token]);

  return null;
}
