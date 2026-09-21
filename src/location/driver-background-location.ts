import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import { readSessionToken } from '@/storage/auth-storage';
import { ensureLocationConsent } from './location-disclosure';
import { readLocationConsent } from './location-consent-storage';

const DRIVER_LOCATION_TASK = 'taxi-grahovo-driver-location';

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  if (!await readLocationConsent('background')) {
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] }).locations;
  const latest = locations?.[locations.length - 1];
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

  if (!await readLocationConsent('background')) {
    if (started) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    if (!requestPermissions || !await ensureLocationConsent('background')) return false;
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  const currentBackground = await Location.getBackgroundPermissionsAsync();
  if (!currentBackground.granted) {
    if (!requestPermissions) return false;
  }
  const background = currentBackground.granted
    ? currentBackground
    : await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return false;
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) return true;

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
      notificationColor: '#F6C945',
      killServiceOnDestroy: false,
    },
  });
  return true;
}
