import * as Notifications from 'expo-notifications';

export async function hasNotificationPermission(): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync();
  return permission.status === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  const permission = await Notifications.requestPermissionsAsync();
  return permission.status === 'granted';
}
