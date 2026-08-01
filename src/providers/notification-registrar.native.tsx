import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';

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

  useEffect(() => {
    if (!Device.isDevice || !token || token.startsWith('demo:')) return;
    void (async () => {
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
      await apiRequest('/v1/push-tokens', {
        method: 'PUT',
        token,
        body: JSON.stringify({ token: pushToken.data, platform: Platform.OS }),
      });
    })().catch(() => {
      // Push registration is retried on the next authenticated app start.
    });
  }, [token]);

  return null;
}
