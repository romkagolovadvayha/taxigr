import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiRequest } from '@/api/client';

async function configureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const channels = [
    ['ride-taxi-found-v2', 'Статусы поездки', Notifications.AndroidImportance.HIGH, 'taxi_found.wav'],
    ['ride-driver-arrived-v2', 'Водитель приехал', Notifications.AndroidImportance.HIGH, 'driver_arrived.wav'],
    ['driver-orders-v2', 'Новые заказы водителю', Notifications.AndroidImportance.MAX, 'new_order.wav'],
    ['ride-chat-v1', 'Сообщения поездки', Notifications.AndroidImportance.HIGH, 'taxi_found.wav'],
    ['ride-complete-v2', 'Поездка завершена', Notifications.AndroidImportance.DEFAULT, 'ride_complete.wav'],
    ['ride-started-v2', 'Поездка началась', Notifications.AndroidImportance.HIGH, 'ride_started.wav'],
    ['ride-cancelled-v2', 'Поездка отменена', Notifications.AndroidImportance.HIGH, 'ride_cancelled.wav'],
  ] as const;
  await Promise.all(channels.map(([id, name, importance, sound]) =>
    Notifications.setNotificationChannelAsync(id, {
      name,
      importance,
      sound,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#FFD600',
    })));
}

export async function syncPushRegistration(
  sessionToken: string,
  requestPermission = false,
): Promise<boolean> {
  await configureAndroidChannels();
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    throw new Error('Удалённые push недоступны в Expo Go. Установите сборку приложения.');
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted'
    ? current
    : requestPermission
      ? await Notifications.requestPermissionsAsync()
      : current;
  if (permission.status !== 'granted') return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('В сборке отсутствует EAS projectId для push-уведомлений.');
  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiRequest('/v1/push-tokens', {
    method: 'PUT',
    token: sessionToken,
    body: JSON.stringify({ token: pushToken.data, platform: Platform.OS }),
  });
  return true;
}
