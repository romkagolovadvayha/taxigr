import { describe, expect, it } from 'vitest';

import {
  fitRouteLocation,
  routePointSizeForZoom,
} from '../src/components/map/route-viewport';

describe('fitRouteLocation', () => {
  const route = [
    { latitude: 56.04758, longitude: 51.95842 },
    { latitude: 55.9902, longitude: 51.8731 },
  ];

  it('zooms out to keep the route inside the uncovered map area', () => {
    const full = fitRouteLocation(route, 390, 844, [82, 18, 18, 18]);
    const withSheet = fitRouteLocation(route, 390, 844, [82, 18, 360, 18]);

    expect(full).not.toBeNull();
    expect(withSheet).not.toBeNull();
    expect(withSheet!.center).toEqual(full!.center);
    expect(withSheet!.zoom).toBeLessThanOrEqual(full!.zoom);
  });

  it('returns null without a drawable viewport or route', () => {
    expect(fitRouteLocation([], 390, 844, [0, 0, 0, 0])).toBeNull();
    expect(fitRouteLocation(route, 0, 844, [0, 0, 0, 0])).toBeNull();
  });

  it('keeps route points tiny until the map is closely zoomed', () => {
    expect(routePointSizeForZoom(14)).toBe(14);
    expect(routePointSizeForZoom(15.49)).toBe(14);
    expect(routePointSizeForZoom(15.5)).toBe(18);
    expect(routePointSizeForZoom(17)).toBe(18);
  });
});
