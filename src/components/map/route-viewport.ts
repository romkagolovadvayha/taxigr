import type { Coordinates } from '@/domain/models';

type MapMargin = [number, number, number, number];

type RouteLocation = {
  center: [number, number];
  zoom: number;
};

const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const CLOSE_ROUTE_POINT_ZOOM = 15.5;

export function routePointSizeForZoom(zoom: number): number {
  return zoom >= CLOSE_ROUTE_POINT_ZOOM ? 18 : 14;
}

function project(coordinates: Coordinates): [number, number] {
  const latitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, coordinates.latitude),
  );
  const sine = Math.sin((latitude * Math.PI) / 180);
  return [
    (coordinates.longitude + 180) / 360,
    0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI),
  ];
}

function unproject([x, y]: [number, number]): [number, number] {
  const longitude = x * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [longitude, latitude];
}

export function fitRouteLocation(
  coordinates: Coordinates[],
  width: number,
  height: number,
  margin: MapMargin,
  minZoom = 6,
  maxZoom = 17,
): RouteLocation | null {
  if (coordinates.length < 2 || width <= 0 || height <= 0) return null;

  const projected = coordinates.map(project);
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const [top, right, bottom, left] = margin;
  const availableWidth = Math.max(32, width - left - right);
  const availableHeight = Math.max(32, height - top - bottom);
  const spanX = Math.max(maximumX - minimumX, Number.EPSILON);
  const spanY = Math.max(maximumY - minimumY, Number.EPSILON);
  const zoomX = Math.log2(availableWidth / (TILE_SIZE * spanX));
  const zoomY = Math.log2(availableHeight / (TILE_SIZE * spanY));
  const zoom = Math.max(minZoom, Math.min(maxZoom, zoomX, zoomY));
  const boundsCenterX = (minimumX + maximumX) / 2;
  const boundsCenterY = (minimumY + maximumY) / 2;

  return {
    center: unproject([boundsCenterX, boundsCenterY]),
    zoom,
  };
}
