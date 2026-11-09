import { describe, expect, it } from 'vitest';
import { MAP_DEFAULT_ZOOM, MAP_SELECTION_ZOOM, mapBearing, taxiMapFit, taxiMapPadding, taxiMapScene, validMapCoordinate } from '../src/components/map/map-scene';
import { fitRouteLocation } from '../src/components/map/route-viewport';
import type { Address } from '../src/domain/models';

const pickup: Address = { id: 'a', label: 'Старт', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const destination: Address = { id: 'b', label: 'Финиш', coordinates: { latitude: 56.04576, longitude: 51.96165 } };
const midway = { latitude: 56.0477, longitude: 51.96165 };
const route = [pickup.coordinates, midway, destination.coordinates];

describe('MapLibre route scene', () => {
  it('preserves road geometry and longitude/latitude order', () => {
    const scene = taxiMapScene({ pickup, destination, routeCoordinates: route });
    expect(scene.route.features[0]?.geometry.coordinates).toEqual([[51.9586, 56.0477], [51.96165, 56.0477], [51.96165, 56.04576]]);
    expect(scene.points.map(p => p.kind)).toEqual(['pickup', 'destination']);
  });
  it('trims the completed road without moving the pickup marker', () => {
    const scene = taxiMapScene({ pickup, destination, routeCoordinates: route, driver: midway, trimCompletedRoute: true });
    expect(scene.points[0]?.coordinates).toEqual([51.9586, 56.0477]);
    expect(scene.route.features[0]?.geometry.coordinates[0]).toEqual([51.96165, 56.0477]);
    expect(scene.fitCoordinates).toEqual(route);
  });
  it('anchors pickup to the arrival endpoint when navigating to the passenger', () => {
    const scene = taxiMapScene({ pickup, destination, routeTarget: 'pickup', routeCoordinates: [midway, pickup.coordinates] });
    expect(scene.points[0]?.coordinates).toEqual([51.9586, 56.0477]);
    expect(scene.points[1]?.coordinates).toEqual([51.96165, 56.04576]);
  });
  it('retains all intermediate stops and the final arrival label', () => {
    const scene = taxiMapScene({ pickup, destinations: [{ id: 'stop', label: 'Остановка', coordinates: midway }, destination], destinationArrivalLabel: '14:30' });
    expect(scene.points.map(p => p.kind)).toEqual(['pickup', 'stop', 'destination']);
    expect(scene.points[2]?.label).toContain('14:30');
  });
  it('uses only a real pickup ETA, without changing the destination or intermediate badges', () => {
    const props = { pickup, destinations: [{ id: 'stop', label: 'Остановка', coordinates: midway }, destination] };
    expect(taxiMapScene({ ...props, pickupEtaMinutes: 4 }).points.map(point => [point.etaMinutes, point.badge]))
      .toEqual([[4, undefined], [undefined, '1'], [undefined, undefined]]);
    expect(taxiMapScene(props).points[0]?.etaMinutes).toBeUndefined();
  });
  it('does not draw a straight line when the road service returns no geometry', () => {
    const scene = taxiMapScene({ pickup, destination });
    expect(scene.route.features).toEqual([]); expect(scene.fitCoordinates).toHaveLength(2);
  });
  it('shows a catalogue estimate and hides a completely unresolved point', () => {
    const scene = taxiMapScene({
      pickup: { ...pickup, id: 'gar:street:4', kind: 'house', houseNumber: '4', coordinatePrecision: 'approximate' },
      destination: { ...destination, id: 'manual:unknown', coordinatePrecision: 'approximate', coordinates: { latitude: 0, longitude: 0 } },
    });
    expect(scene.points).toMatchObject([{ kind: 'pickup', coordinates: [51.9586, 56.0477], label: 'Место подачи' }]);
  });
  it('rejects corrupt geometry and does not mutate the original route', () => {
    const input = [...route, { latitude: NaN, longitude: 52 }];
    expect(taxiMapScene({ routeCoordinates: input }).route.features).toEqual([]);
    expect(input).toHaveLength(4);
    expect(validMapCoordinate({ latitude: 90, longitude: 52 })).toBe(false);
    expect(validMapCoordinate({ latitude: 56, longitude: Infinity })).toBe(false);
  });
  it('normalizes headings crossing north and handles missing GPS bearings', () => {
    expect([mapBearing(-1), mapBearing(361), mapBearing(NaN), mapBearing(null)]).toEqual([359, 1, 0, 0]);
  });
});

describe('MapLibre camera', () => {
  it('centers a single selected address even outside Grahovo', () => {
    const point = { latitude: 56.8605, longitude: 53.1977 };
    expect(taxiMapFit([point], 390, 844, taxiMapPadding(390, 844))).toEqual({ center: [53.1977, 56.8605], zoom: 16.5 });
  });
  it('uses an address scale for a single point and a wider scale for the route', () => {
    const padding = taxiMapPadding(390, 500, undefined, true);
    const from = pickup.coordinates;
    const nearby = { ...from, latitude: from.latitude + 0.0001 };
    const faraway = { latitude: 56.85, longitude: 53.2 };
    const single = taxiMapFit([from], 390, 500, padding)!;
    const short = taxiMapFit([from, nearby], 390, 500, padding)!;
    const long = taxiMapFit([from, faraway], 390, 500, padding)!;
    expect(taxiMapFit([], 390, 500, padding)?.zoom).toBe(MAP_DEFAULT_ZOOM);
    expect(single.zoom).toBeLessThan(MAP_SELECTION_ZOOM);
    expect(short.zoom).toBeLessThan(single.zoom);
    expect(long.zoom).toBeLessThan(short.zoom);
  });
  it('fits with 512-pixel tiles, preserving the same ground extent as the old map', () => {
    const padding = taxiMapPadding(390, 844, { bottom: 360, top: 82 }, true);
    const next = taxiMapFit(route, 390, 844, padding)!;
    const old = fitRouteLocation(route, 390, 844, [padding.top, padding.right, padding.bottom, padding.left], 5, 18)!;
    expect(next.zoom).toBeCloseTo(old.zoom - 1);
    expect(next.center).toEqual(old.center);
  });
  it('keeps a usable viewport even with a large bottom sheet or tiny preview', () => {
    const padding = taxiMapPadding(320, 120, { top: 82, bottom: 360, left: 80, right: 80 }, true);
    expect(padding.top + padding.bottom).toBeLessThanOrEqual(56.00001);
    expect(padding.left + padding.right).toBeLessThanOrEqual(256);
    expect(taxiMapFit(route, 320, 120, padding)?.zoom).toBeGreaterThan(5);
  });
  it('allows a long route to zoom below 5 in a small map', () => {
    const padding = taxiMapPadding(320, 180, { top: 44, bottom: 60 }, true);
    const moscow = { latitude: 55.7558, longitude: 37.6173 };
    expect(taxiMapFit([pickup.coordinates, moscow], 320, 180, padding)?.zoom).toBeLessThan(5);
  });
  it('ignores invalid insets and waits for an actual layout', () => {
    expect(taxiMapPadding(390, 844, { top: NaN, bottom: -50 })).toEqual({ top: 18, right: 18, bottom: 18, left: 18 });
    expect(taxiMapFit(route, 0, 0, taxiMapPadding(0, 0))).toBeNull();
  });
});
