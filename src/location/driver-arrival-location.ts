import * as Location from 'expo-location';

import { ensureForegroundLocationPermission } from './foreground-location-permission';

export type DriverArrivalLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  recordedAt: number;
};

function arrivalLocation(position: Location.LocationObject | null): DriverArrivalLocation | undefined {
  if (!position) return;
  const { latitude, longitude, accuracy } = position.coords;
  const age = Date.now() - position.timestamp;
  if (!Number.isFinite(age) || age < -30_000 || age > 30_000 ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
    (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 200))) return;
  return { latitude, longitude, accuracyMeters: accuracy ?? undefined, recordedAt: position.timestamp };
}

/** One fresh fix for arrival; independent of the throttled background publisher. */
export async function getDriverArrivalLocation(): Promise<DriverArrivalLocation | undefined> {
  const permission = await ensureForegroundLocationPermission('driver');
  if (!permission.granted) {
    throw new Error('Разрешите геолокацию в настройках приложения и снова нажмите «Я на месте».');
  }
  const fresh = await new Promise<DriverArrivalLocation | undefined>((resolve) => {
    let finished = false;
    let subscription: Location.LocationSubscription | undefined;
    const finish = (value?: DriverArrivalLocation) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      subscription?.remove();
      resolve(value);
    };
    const timer = setTimeout(() => finish(), 12_000);
    void Location.watchPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 1_000,
      distanceInterval: 0,
      mayShowUserSettingsDialog: true,
    }, position => {
      const value = arrivalLocation(position);
      if (value) finish(value);
    }, () => finish()).then(value => {
      subscription = value;
      if (finished) subscription.remove();
    }).catch(() => finish());
  });
  if (fresh) return fresh;
  // A recent fix can still be available after a transient GPS/watch failure.
  // Otherwise let the server check its own latest position; never invent one.
  return arrivalLocation(await Location.getLastKnownPositionAsync({
    maxAge: 30_000, requiredAccuracy: 200,
  }).catch(() => null));
}
