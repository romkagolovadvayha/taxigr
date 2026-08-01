import { describe, expect, it } from 'vitest';

import { estimateRoute, haversineMeters, parseOsrmRoute } from '../server/routing';

const grahovo = { latitude: 56.04758, longitude: 51.95842 };
const mozhga = { latitude: 56.4439, longitude: 52.2274 };

describe('open routing fallback', () => {
  it('calculates a plausible direct distance', () => {
    const distance = haversineMeters(grahovo, mozhga);
    expect(distance).toBeGreaterThan(45_000);
    expect(distance).toBeLessThan(50_000);
  });

  it('uses a conservative road estimate when OSRM is unavailable', () => {
    const direct = haversineMeters(grahovo, mozhga);
    const route = estimateRoute(grahovo, mozhga);
    expect(route.source).toBe('estimate');
    expect(route.distanceMeters).toBeGreaterThan(direct);
    expect(route.durationSeconds).toBeGreaterThan(2_000);
    expect(route.coordinates).toEqual([]);
  });

  it('keeps very short rides above the operational minimum', () => {
    const route = estimateRoute(grahovo, grahovo);
    expect(route.distanceMeters).toBe(800);
    expect(route.durationSeconds).toBe(300);
  });

  it('converts OSRM GeoJSON into latitude/longitude points in road order', () => {
    const route = parseOsrmRoute({
      code: 'Ok',
      routes: [
        {
          distance: 12_800.7,
          duration: 1_624.4,
          geometry: {
            type: 'LineString',
            coordinates: [
              [51.958642, 56.047665],
              [51.926203, 56.025314],
              [51.847813, 55.978983],
            ],
          },
        },
      ],
    });

    expect(route).toEqual({
      distanceMeters: 12_801,
      durationSeconds: 1_624,
      source: 'osrm',
      coordinates: [
        { latitude: 56.047665, longitude: 51.958642 },
        { latitude: 56.025314, longitude: 51.926203 },
        { latitude: 55.978983, longitude: 51.847813 },
      ],
    });
  });

  it('rejects an OSRM response without drawable road geometry', () => {
    expect(() =>
      parseOsrmRoute({
        code: 'Ok',
        routes: [{ distance: 1_000, duration: 120 }],
      }),
    ).toThrow('OSRM route is unavailable');
  });
});
