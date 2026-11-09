import type { FeatureCollection, LineString } from 'geojson';

import { grahovoCenter } from '../../data/service-area';
import { routeDestinationMapLabel } from '../../domain/route-label';
import { remainingRouteCoordinates } from '../../domain/route-tracking';
import type { Coordinates } from '../../domain/models';
import { lngLat, validMapCoordinate, type LngLat } from '../../domain/map-coordinates';
import type { MapViewportInsets, TaxiMapProps } from './types';
import { fitRouteLocation } from './route-viewport';
import { hasApproximateCoordinates, isDirectoryHouseEstimate } from '../../domain/address-precision';

export { lngLat, mapBearing, validMapCoordinate, type LngLat } from '../../domain/map-coordinates';

export type RouteMapPoint = { id: string; kind: 'pickup' | 'stop' | 'destination'; coordinates: LngLat; label: string; badge?: string; etaMinutes?: number; destinationIndex: number | null };
export const MAP_SELECTION_ZOOM = 17;
export const MAP_DEFAULT_ZOOM = 14;
export const MAP_MIN_ZOOM = 2;
export const MAP_MAX_ZOOM = 19;
export const ROUTE_CALLOUT_HEIGHT = 40;
export const ROUTE_CALLOUT_GAP = 3;
export const ROUTE_CALLOUT_SIDE_PADDING = 4;
export const ROUTE_PIN_STEM_HEIGHT = 6;
export const ROUTE_PIN_SIZE = 12;
const MAP_ADDRESS_ZOOM = 16.5;
const MAP_ROUTE_MAX_ZOOM = 16;

export function taxiMapScene(props: TaxiMapProps) {
  // Never bridge corrupt geometry with a made-up straight route.
  const original = props.routeCoordinates?.every(validMapCoordinate) ? props.routeCoordinates : [];
  const rendered = props.trimCompletedRoute && validMapCoordinate(props.driver)
    ? remainingRouteCoordinates(original, props.driver) : original;
  const points: RouteMapPoint[] = [];
  const pickup = props.routeTarget === 'pickup' ? original[original.length - 1] ?? props.pickup?.coordinates
    : original[0] ?? props.pickup?.coordinates;
  const approximatePickup = isDirectoryHouseEstimate(props.pickup);
  if (props.pickup && (!hasApproximateCoordinates(props.pickup) || approximatePickup) && validMapCoordinate(pickup)) points.push({
    id: 'pickup', kind: 'pickup', coordinates: lngLat(pickup), destinationIndex: null,
    label: 'Место подачи',
    etaMinutes: !approximatePickup && Number.isFinite(props.pickupEtaMinutes) && props.pickupEtaMinutes! > 0
      ? Math.ceil(props.pickupEtaMinutes!) : undefined,
  });
  const destinations = props.destinations?.length ? props.destinations : props.destination ? [props.destination] : [];
  destinations.forEach((destination, index) => {
    const final = index === destinations.length - 1;
    // A route to pickup must never move destination pins onto the pickup point.
    const coordinates = final && props.routeTarget !== 'pickup' ? original[original.length - 1] ?? destination.coordinates : destination.coordinates;
    const approximate = isDirectoryHouseEstimate(destination);
    if ((!hasApproximateCoordinates(destination) || approximate) && validMapCoordinate(coordinates)) points.push({
      id: `destination-${index}`, kind: final ? 'destination' : 'stop', coordinates: lngLat(coordinates),
      badge: final ? undefined : String(index + 1), destinationIndex: index,
      label: routeDestinationMapLabel(index, destinations.length, final && !approximate ? props.destinationArrivalLabel : undefined),
    });
  });
  const route: FeatureCollection<LineString> = { type: 'FeatureCollection', features: rendered.length < 2 ? [] : [{
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: rendered.map(lngLat) },
  }] };
  const fitCoordinates = original.length >= 2 ? original : points.map(p => ({ longitude: p.coordinates[0], latitude: p.coordinates[1] }));
  return { points, route, fitCoordinates };
}

export function routePointAccessibilityLabel(point: RouteMapPoint, editable: boolean) {
  return [editable ? 'Изменить' : '', point.label, point.etaMinutes ? `· ${point.etaMinutes} мин` : ''].filter(Boolean).join(' ');
}

export function taxiMapPadding(width: number, height: number, insets?: MapViewportInsets, callouts = false) {
  const safe = (value?: number) => Number.isFinite(value) ? Math.max(0, value!) : 0;
  let top = safe(insets?.top) + (callouts ? ROUTE_CALLOUT_HEIGHT + ROUTE_PIN_STEM_HEIGHT + ROUTE_PIN_SIZE / 2 : 18);
  let bottom = safe(insets?.bottom) + 18;
  let left = safe(insets?.left) + (callouts ? 86 : 18), right = safe(insets?.right) + (callouts ? 86 : 18);
  const xScale = Math.min(1, Math.max(0, width - 64) / Math.max(1, left + right));
  const yScale = Math.min(1, Math.max(0, height - 64) / Math.max(1, top + bottom));
  left *= xScale; right *= xScale; top *= yScale; bottom *= yScale;
  return { top, right, bottom, left };
}

export function taxiMapFit(coordinates: Coordinates[], width: number, height: number, padding: ReturnType<typeof taxiMapPadding>, defaultCenter = grahovoCenter) {
  if (width <= 0 || height <= 0) return null;
  if (!coordinates.length) return { center: lngLat(defaultCenter), zoom: MAP_DEFAULT_ZOOM };
  if (coordinates.length === 1 && validMapCoordinate(coordinates[0])) {
    return { center: lngLat(coordinates[0]), zoom: MAP_ADDRESS_ZOOM };
  }
  return fitRouteLocation(coordinates, width, height,
    [padding.top, padding.right, padding.bottom, padding.left], MAP_MIN_ZOOM, MAP_ROUTE_MAX_ZOOM, 512);
}
