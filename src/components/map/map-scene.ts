import type { FeatureCollection, LineString } from 'geojson';

import { routeDestinationMapLabel } from '../../domain/route-label';
import { remainingRouteCoordinates } from '../../domain/route-tracking';
import type { Coordinates } from '../../domain/models';
import { lngLat, validMapCoordinate, type LngLat } from '../../domain/map-coordinates';
import type { MapViewportInsets, TaxiMapProps } from './types';
import { fitRouteLocation } from './route-viewport';

export { lngLat, mapBearing, validMapCoordinate, type LngLat } from '../../domain/map-coordinates';

export type RouteMapPoint = { id: string; kind: 'pickup' | 'stop' | 'destination'; coordinates: LngLat; label: string };
export const MAP_SELECTION_ZOOM = 18;
export const MAP_DEFAULT_ZOOM = 14;
export const MAP_MAX_ZOOM = 19;

export function taxiMapScene(props: TaxiMapProps) {
  // Never bridge corrupt geometry with a made-up straight route.
  const original = props.routeCoordinates?.every(validMapCoordinate) ? props.routeCoordinates : [];
  const rendered = props.trimCompletedRoute && validMapCoordinate(props.driver)
    ? remainingRouteCoordinates(original, props.driver) : original;
  const points: RouteMapPoint[] = [];
  const pickup = props.routeTarget === 'pickup' ? original[original.length - 1] ?? props.pickup?.coordinates
    : original[0] ?? props.pickup?.coordinates;
  if (props.pickup && validMapCoordinate(pickup)) points.push({
    id: 'pickup', kind: 'pickup', coordinates: lngLat(pickup),
    label: props.pickupEtaMinutes ? `Старт · ${props.pickupEtaMinutes} мин` : 'Старт',
  });
  const destinations = props.destinations?.length ? props.destinations : props.destination ? [props.destination] : [];
  destinations.forEach((destination, index) => {
    const final = index === destinations.length - 1;
    // A route to pickup must never move destination pins onto the pickup point.
    const coordinates = final && props.routeTarget !== 'pickup' ? original[original.length - 1] ?? destination.coordinates : destination.coordinates;
    if (validMapCoordinate(coordinates)) points.push({
      id: `destination-${index}`, kind: final ? 'destination' : 'stop', coordinates: lngLat(coordinates),
      label: routeDestinationMapLabel(index, destinations.length, final ? props.destinationArrivalLabel : undefined),
    });
  });
  const route: FeatureCollection<LineString> = { type: 'FeatureCollection', features: rendered.length < 2 ? [] : [{
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: rendered.map(lngLat) },
  }] };
  const fitCoordinates = original.length >= 2 ? original : points.map(p => ({ longitude: p.coordinates[0], latitude: p.coordinates[1] }));
  return { points, route, fitCoordinates };
}

export function taxiMapPadding(width: number, height: number, insets?: MapViewportInsets, callouts = false) {
  const safe = (value?: number) => Number.isFinite(value) ? Math.max(0, value!) : 0;
  let top = safe(insets?.top) + 18, bottom = safe(insets?.bottom) + 18;
  let left = safe(insets?.left) + (callouts ? 86 : 18), right = safe(insets?.right) + (callouts ? 86 : 18);
  const xScale = Math.min(1, Math.max(0, width - 64) / Math.max(1, left + right));
  const yScale = Math.min(1, Math.max(0, height - 64) / Math.max(1, top + bottom));
  left *= xScale; right *= xScale; top *= yScale; bottom *= yScale;
  return { top, right, bottom, left };
}

export function taxiMapFit(coordinates: Coordinates[], width: number, height: number, padding: ReturnType<typeof taxiMapPadding>) {
  if (coordinates.length === 1 && validMapCoordinate(coordinates[0]) && width > 0 && height > 0) {
    return { center: lngLat(coordinates[0]), zoom: 15.5 };
  }
  return fitRouteLocation(coordinates, width, height,
    [padding.top, padding.right, padding.bottom, padding.left], 5, 17, 512);
}
