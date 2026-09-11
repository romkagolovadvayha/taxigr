import { describe, expect, it } from 'vitest';
import { mapBearing, taxiMapFit, taxiMapPadding, taxiMapScene, validMapCoordinate } from '../src/components/map/map-scene';
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
  it('does not draw a straight line when the road service returns no geometry', () => {
    const scene = taxiMapScene({ pickup, destination });
    expect(scene.route.features).toEqual([]); expect(scene.fitCoordinates).toHaveLength(2);
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
    expect(taxiMapFit([point], 390, 844, taxiMapPadding(390, 844))).toEqual({ center: [53.1977, 56.8605], zoom: 15.5 });
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
  it('ignores invalid insets and waits for an actual layout', () => {
    expect(taxiMapPadding(390, 844, { top: NaN, bottom: -50 })).toEqual({ top: 18, right: 18, bottom: 18, left: 18 });
    expect(taxiMapFit(route, 0, 0, taxiMapPadding(0, 0))).toBeNull();
  });
});
