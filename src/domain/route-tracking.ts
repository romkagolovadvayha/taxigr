import type { Coordinates } from './models';

const EARTH_RADIUS_METERS = 6_371_000;
const SAME_POINT_EPSILON = 1e-10;

export type RoutePosition = {
  coordinates: Coordinates;
  heading: number | null;
};

export function coordinatesDistanceMeters(from: Coordinates, to: Coordinates): number {
  const latitudeRadians = (((from.latitude + to.latitude) / 2) * Math.PI) / 180;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const x = longitudeDelta * Math.cos(latitudeRadians);
  return Math.hypot(x, latitudeDelta) * EARTH_RADIUS_METERS;
}

export function headingBetweenCoordinates(
  from: Coordinates,
  to: Coordinates,
): number | null {
  if (coordinatesDistanceMeters(from, to) < 0.2) return null;
  const latitudeScale = Math.cos((((from.latitude + to.latitude) / 2) * Math.PI) / 180);
  const east = (to.longitude - from.longitude) * latitudeScale;
  const north = to.latitude - from.latitude;
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
}

function interpolateCoordinates(
  from: Coordinates,
  to: Coordinates,
  progress: number,
): Coordinates {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress,
  };
}

export function routePositionAtProgress(
  route: Coordinates[] | null | undefined,
  progress: number,
): RoutePosition | null {
  if (!route?.length) return null;
  if (route.length === 1) return { coordinates: route[0]!, heading: null };

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segmentLengths = route.slice(0, -1).map((point, index) =>
    coordinatesDistanceMeters(point, route[index + 1]!),
  );
  const totalLength = segmentLengths.reduce((total, length) => total + length, 0);
  if (totalLength <= 0) return { coordinates: route[0]!, heading: null };

  const targetDistance = totalLength * clampedProgress;
  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index]!;
    if (traversed + segmentLength >= targetDistance || index === segmentLengths.length - 1) {
      const from = route[index]!;
      const to = route[index + 1]!;
      const segmentProgress =
        segmentLength > 0 ? (targetDistance - traversed) / segmentLength : 0;
      return {
        coordinates: interpolateCoordinates(from, to, segmentProgress),
        heading: headingBetweenCoordinates(from, to),
      };
    }
    traversed += segmentLength;
  }

  return null;
}

/**
 * Projects the live driver position onto the closest route segment and returns
 * only the road that is still ahead. This keeps GPS drift from creating a
 * diagonal line from the car while ensuring the completed part disappears.
 */
export function remainingRouteCoordinates(
  route: Coordinates[] | null | undefined,
  driver: Coordinates | null | undefined,
): Coordinates[] {
  if (!route?.length) return [];
  if (!driver || route.length < 2) return [...route];

  const latitudeScale = Math.cos((driver.latitude * Math.PI) / 180);
  let closest:
    | { segmentIndex: number; progress: number; distanceSquared: number }
    | undefined;

  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index]!;
    const to = route[index + 1]!;
    const fromX = (from.longitude - driver.longitude) * latitudeScale;
    const fromY = from.latitude - driver.latitude;
    const toX = (to.longitude - driver.longitude) * latitudeScale;
    const toY = to.latitude - driver.latitude;
    const segmentX = toX - fromX;
    const segmentY = toY - fromY;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const progress =
      segmentLengthSquared > 0
        ? Math.max(
            0,
            Math.min(1, -(fromX * segmentX + fromY * segmentY) / segmentLengthSquared),
          )
        : 0;
    const projectedX = fromX + segmentX * progress;
    const projectedY = fromY + segmentY * progress;
    const distanceSquared = projectedX * projectedX + projectedY * projectedY;

    if (!closest || distanceSquared < closest.distanceSquared) {
      closest = { segmentIndex: index, progress, distanceSquared };
    }
  }

  if (!closest) return [...route];
  const segmentStart = route[closest.segmentIndex]!;
  const segmentEnd = route[closest.segmentIndex + 1]!;
  const projected = interpolateCoordinates(segmentStart, segmentEnd, closest.progress);
  if (
    closest.segmentIndex === route.length - 2 &&
    closest.progress >= 0.999
  ) {
    return [];
  }

  const upcoming = route.slice(closest.segmentIndex + 1);
  const firstUpcoming = upcoming[0];
  if (
    firstUpcoming &&
    Math.abs(firstUpcoming.latitude - projected.latitude) < SAME_POINT_EPSILON &&
    Math.abs(firstUpcoming.longitude - projected.longitude) < SAME_POINT_EPSILON
  ) {
    return upcoming;
  }
  return [projected, ...upcoming];
}
