import type { Coordinates, RideStatus } from '@/domain/models';

const earthRadiusMeters = 6_371_000;
const roadDistanceFactor = 1.25;
const urbanApproachMetersPerMinute = 350;
const maximumDisplayedEtaMinutes = 99;

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceBetweenCoordinates(
  from: Coordinates,
  to: Coordinates,
): number {
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function estimatePickupEtaMinutes({
  driver,
  pickup,
  status,
}: {
  driver?: Coordinates | null;
  pickup?: Coordinates | null;
  status?: RideStatus | null;
}): number | null {
  if (status === 'driver_waiting') return 0;
  if (status !== 'accepted' && status !== 'driver_arriving') return null;
  if (!driver || !pickup) return null;

  const airDistanceMeters = distanceBetweenCoordinates(driver, pickup);
  if (!Number.isFinite(airDistanceMeters)) return null;

  const estimate = Math.ceil(
    (airDistanceMeters * roadDistanceFactor) / urbanApproachMetersPerMinute,
  );

  return Math.min(maximumDisplayedEtaMinutes, Math.max(1, estimate));
}
