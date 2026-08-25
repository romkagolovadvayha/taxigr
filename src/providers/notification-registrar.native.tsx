import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // Foreground sounds are played by RideFeedbackProvider to honor in-app preferences
    // and avoid a duplicate sound when the same update also arrives through the socket.
    shouldPlaySound: false,
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
    if (!Device.isDevice || !token || token.startsWith('demo:')) return;
    let active = true;
    const register = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('ride-taxi-found-v2', {
          name: 'Статусы поездки',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'taxi_found.wav',
          vibrationPattern: [0, 180, 100, 180],
          lightColor: '#FFD600',
        });
        await Notifications.setNotificationChannelAsync('ride-driver-arrived-v2', {
          name: 'Водитель приехал',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'driver_arrived.wav',
          vibrationPattern: [0, 220, 100, 220],
          lightColor: '#FFD600',
        });
        await Notifications.setNotificationChannelAsync('driver-orders-v2', {
          name: 'Новые заказы водителю',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'new_order.wav',
          vibrationPattern: [0, 250, 180, 250],
          lightColor: '#FFD600',
        });
        await Notifications.setNotificationChannelAsync('ride-complete-v2', {
          name: 'Поездка завершена',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'ride_complete.wav',
          vibrationPattern: [0, 160],
          lightColor: '#FFD600',
        });
        await Notifications.setNotificationChannelAsync('ride-started-v2', {
          name: 'Поездка началась',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'ride_started.wav',
          vibrationPattern: [0, 180],
          lightColor: '#FFD600',
        });
        await Notifications.setNotificationChannelAsync('ride-cancelled-v2', {
          name: 'Поездка отменена',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'ride_cancelled.wav',
          vibrationPattern: [0, 180, 90, 180],
          lightColor: '#FFD600',
        });
      }
      const current = await Notifications.getPermissionsAsync();
      const permission =
        current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') return;
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!active) return;
      await apiRequest('/v1/push-tokens', {
        method: 'PUT',
        token,
        body: JSON.stringify({ token: pushToken.data, platform: Platform.OS }),
      });
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
