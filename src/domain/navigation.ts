import type { Coordinates } from '@/domain/models';

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceBetweenCoordinates(
  from: Coordinates,
  to: Coordinates,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function drawableNavigationRoute(
  coordinates: Coordinates[] | null | undefined,
  origin: Coordinates,
  target: Coordinates,
): Coordinates[] {
  return coordinates && coordinates.length >= 2 ? coordinates : [origin, target];
}

export function navigationPositionBucket(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}`;
}

export function formatNavigationDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) {
    return `${Math.max(10, Math.round(distanceMeters / 10) * 10)} м`;
  }
  return `${(distanceMeters / 1_000).toFixed(distanceMeters < 10_000 ? 1 : 0).replace('.', ',')} км`;
}
