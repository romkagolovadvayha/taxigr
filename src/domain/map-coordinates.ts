import type { Coordinates } from './models';

export type LngLat = [number, number];

export function validMapCoordinate(point: Coordinates | null | undefined): point is Coordinates {
  return Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 85.05112878 && Math.abs(point.longitude) <= 180);
}

export function lngLat(point: Coordinates): LngLat { return [point.longitude, point.latitude]; }
export function mapBearing(heading?: number | null): number {
  return typeof heading === 'number' && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0;
}
