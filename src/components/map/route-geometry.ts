import type { Coordinates } from '@/domain/models';

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_CORNER_TRIM_METERS = 10;
const MAX_SEGMENT_TRIM_RATIO = 0.2;
const CURVE_STEPS = 3;
const MIN_TURN_DEGREES = 18;
const MAX_TURN_DEGREES = 165;

function distanceMeters(from: Coordinates, to: Coordinates): number {
  const latitudeRadians = (((from.latitude + to.latitude) / 2) * Math.PI) / 180;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const x = longitudeDelta * Math.cos(latitudeRadians);
  return Math.hypot(x, latitudeDelta) * EARTH_RADIUS_METERS;
}

function interpolate(from: Coordinates, to: Coordinates, progress: number): Coordinates {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress,
  };
}

function quadraticBezier(
  start: Coordinates,
  control: Coordinates,
  end: Coordinates,
  progress: number,
): Coordinates {
  const remaining = 1 - progress;
  return {
    latitude:
      remaining * remaining * start.latitude +
      2 * remaining * progress * control.latitude +
      progress * progress * end.latitude,
    longitude:
      remaining * remaining * start.longitude +
      2 * remaining * progress * control.longitude +
      progress * progress * end.longitude,
  };
}

function turnDegrees(previous: Coordinates, corner: Coordinates, next: Coordinates): number {
  const latitudeScale = Math.cos((corner.latitude * Math.PI) / 180);
  const incomingX = (corner.longitude - previous.longitude) * latitudeScale;
  const incomingY = corner.latitude - previous.latitude;
  const outgoingX = (next.longitude - corner.longitude) * latitudeScale;
  const outgoingY = next.latitude - corner.latitude;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength === 0 || outgoingLength === 0) return 0;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (incomingX * outgoingX + incomingY * outgoingY) /
        (incomingLength * outgoingLength),
    ),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * Rounds only the visible joins of a road route. The original route is kept for
 * pricing and navigation; the rendered curve trims at most ten metres around
 * a corner so it cannot noticeably cut across roads or buildings.
 */
export function smoothRouteCoordinates(
  coordinates: Coordinates[] | null | undefined,
): Coordinates[] {
  if (!coordinates?.length) return [];
  if (coordinates.length < 3) return [...coordinates];

  const first = coordinates[0]!;
  const last = coordinates.at(-1)!;
  const result: Coordinates[] = [first];

  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const previous = coordinates[index - 1]!;
    const corner = coordinates[index]!;
    const next = coordinates[index + 1]!;
    const incomingLength = distanceMeters(previous, corner);
    const outgoingLength = distanceMeters(corner, next);
    const turn = turnDegrees(previous, corner, next);

    if (
      incomingLength < 0.5 ||
      outgoingLength < 0.5 ||
      turn < MIN_TURN_DEGREES ||
      turn > MAX_TURN_DEGREES
    ) {
      result.push(corner);
      continue;
    }

    const trimMeters = Math.min(
      MAX_CORNER_TRIM_METERS,
      incomingLength * MAX_SEGMENT_TRIM_RATIO,
      outgoingLength * MAX_SEGMENT_TRIM_RATIO,
    );
    const entry = interpolate(corner, previous, trimMeters / incomingLength);
    const exit = interpolate(corner, next, trimMeters / outgoingLength);
    result.push(entry);
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      result.push(quadraticBezier(entry, corner, exit, step / CURVE_STEPS));
    }
  }

  result.push(last);
  return result;
}
