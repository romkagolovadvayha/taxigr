import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiRequest } from '@/api/client';
import {
  getRuStorePushToken,
  isRuStorePushEnabled,
} from '@/notifications/rustore-push';

async function configureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const channels = [
    ['ride-taxi-found-v2', 'Статусы поездки', Notifications.AndroidImportance.HIGH, 'taxi_found.wav'],
    ['ride-driver-arrived-v2', 'Водитель приехал', Notifications.AndroidImportance.HIGH, 'driver_arrived.wav'],
    ['driver-orders-v2', 'Новые заказы водителю', Notifications.AndroidImportance.MAX, 'new_order.wav'],
    ['ride-chat-voice-v1', 'Сообщения поездки', Notifications.AndroidImportance.HIGH, 'chat_message.wav'],
    ['ride-driver-arriving-voice-v1', 'Водитель в пути', Notifications.AndroidImportance.HIGH, 'driver_arriving.wav'],
    ['driver-order-updated-voice-v1', 'Стоимость заказа повышена', Notifications.AndroidImportance.HIGH, 'order_updated.wav'],
    ['general-voice-v1', 'Уведомления сервиса', Notifications.AndroidImportance.DEFAULT, 'notification.wav'],
    ['ride-complete-v2', 'Поездка завершена', Notifications.AndroidImportance.DEFAULT, 'ride_complete.wav'],
    ['ride-started-v2', 'Поездка началась', Notifications.AndroidImportance.HIGH, 'ride_started.wav'],
    ['ride-cancelled-v2', 'Поездка отменена', Notifications.AndroidImportance.HIGH, 'ride_cancelled.wav'],
    ['ride-taxi-found-queued-voice-v1', 'Водитель завершает другую поездку', Notifications.AndroidImportance.HIGH, 'taxi_found_queued.wav'],
    ['ride-complete-cash-voice-v1', 'Поездка завершена — наличные', Notifications.AndroidImportance.DEFAULT, 'ride_complete_cash.wav'],
    ['ride-complete-transfer-voice-v1', 'Поездка завершена — перевод', Notifications.AndroidImportance.DEFAULT, 'ride_complete_transfer.wav'],
    ['ride-driver-released-voice-v1', 'Повторный поиск водителя', Notifications.AndroidImportance.HIGH, 'driver_released.wav'],
    ['ride-passenger-cancelled-voice-v1', 'Пассажир отменил заказ', Notifications.AndroidImportance.HIGH, 'passenger_cancelled.wav'],
    ['ride-admin-cancelled-voice-v1', 'Отмена администратором', Notifications.AndroidImportance.HIGH, 'admin_cancelled.wav'],
    ['ride-search-timeout-voice-v1', 'Водитель не найден', Notifications.AndroidImportance.HIGH, 'search_timeout.wav'],
  ] as const;
  const previousChannels: Record<string, string> = {
    'ride-chat-voice-v1': 'ride-chat-v1',
    'ride-driver-arriving-voice-v1': 'ride-taxi-found-v2',
    'driver-order-updated-voice-v1': 'driver-orders-v2',
    'general-voice-v1': 'ride-taxi-found-v2',
    'ride-taxi-found-queued-voice-v1': 'ride-taxi-found-v2',
    'ride-complete-cash-voice-v1': 'ride-complete-v2',
    'ride-complete-transfer-voice-v1': 'ride-complete-v2',
    'ride-driver-released-voice-v1': 'ride-cancelled-v2',
    'ride-passenger-cancelled-voice-v1': 'ride-cancelled-v2',
    'ride-admin-cancelled-voice-v1': 'ride-cancelled-v2',
    'ride-search-timeout-voice-v1': 'ride-cancelled-v2',
  };
  await Promise.all(channels.map(async ([id, name, importance, sound]) => {
    const previousId = previousChannels[id];
    const inherited = previousId && !(await Notifications.getNotificationChannelAsync(id))
      ? await Notifications.getNotificationChannelAsync(previousId)
      : null;
    await Notifications.setNotificationChannelAsync(id, {
      name,
      importance: inherited?.importance ?? importance,
      // Preserve a user's muted channel when moving chat to its own spoken clip.
      sound: inherited?.sound === null ? null : sound,
      enableVibrate: inherited?.enableVibrate ?? true,
      vibrationPattern: inherited?.vibrationPattern ?? [0, 250, 180, 250],
      lightColor: '#F6C945',
    });
  }));
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
  const provider = isRuStorePushEnabled() ? 'rustore' : 'expo';
  let pushToken: string;
  if (provider === 'rustore') {
    const rustoreToken = await getRuStorePushToken();
    if (!rustoreToken) return false;
    pushToken = rustoreToken;
  } else {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('В сборке отсутствует EAS projectId для push-уведомлений.');
    pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }
  await apiRequest('/v1/push-tokens', {
    method: 'PUT',
    token: sessionToken,
    body: JSON.stringify({ token: pushToken, platform: Platform.OS, provider }),
  });
  return true;
}
