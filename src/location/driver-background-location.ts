import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import { readSessionToken } from '@/storage/auth-storage';

const DRIVER_LOCATION_TASK = 'taxi-grahovo-driver-location';

function confirmBackgroundLocationDisclosure(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(true);

  return new Promise((resolve) => {
    Alert.alert(
      'Геолокация водителя',
      '«Такси Грахово» собирает данные о местоположении, чтобы передавать диспетчеру и пассажиру позицию водителя и поддерживать навигацию, даже когда приложение закрыто или не используется. Данные передаются только пока водитель находится на линии или выполняет поездку.',
      [
        { text: 'Не сейчас', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Продолжить', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const locations = (data as { locations?: Location.LocationObject[] }).locations;
  const latest = locations?.at(-1);
  if (!latest) return;
  const token = await readSessionToken();
  if (!token || token.startsWith('demo:')) return;
  try {
    await apiRequest('/v1/driver/location', {
      method: 'PUT',
      token,
      timeoutMs: 10_000,
      body: JSON.stringify({
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracyMeters: latest.coords.accuracy ?? undefined,
      }),
    });
  } catch (requestError) {
    if (
      requestError instanceof ApiError &&
      (requestError.status === 401 || requestError.status === 403 || requestError.status === 409) &&
      await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)
    ) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  }
});

export async function syncDriverBackgroundLocation(
  enabled: boolean,
  requestPermissions = true,
): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const available = await TaskManager.isAvailableAsync();
  if (!available) return false;
  const started = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  if (!enabled) {
    if (started) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    return true;
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  const currentBackground = await Location.getBackgroundPermissionsAsync();
  if (!currentBackground.granted) {
    if (!requestPermissions) return false;
    const accepted = await confirmBackgroundLocationDisclosure();
    if (!accepted) return false;
  }
  const background = currentBackground.granted
    ? currentBackground
    : await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return false;
  if (started) return true;

  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 10_000,
    distanceInterval: 25,
    deferredUpdatesInterval: 10_000,
    deferredUpdatesDistance: 25,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Такси Грахово — водитель на линии',
      notificationBody: 'Геопозиция передаётся только пока вы принимаете заказы',
      notificationColor: '#FFD600',
      killServiceOnDestroy: false,
    },
  });
  return true;
}
