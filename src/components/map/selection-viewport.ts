import type { Coordinates } from '@/domain/models';

export const POINT_SELECTION_ZOOM = 19;

export function pointSelectionLocation(coordinates: Coordinates) {
  return {
    center: [coordinates.longitude, coordinates.latitude] as [number, number],
    zoom: POINT_SELECTION_ZOOM,
  };
}
