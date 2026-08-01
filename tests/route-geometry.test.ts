import { describe, expect, it } from 'vitest';

import { smoothRouteCoordinates } from '../src/components/map/route-geometry';

describe('smoothRouteCoordinates', () => {
  it('keeps endpoints and gently rounds a visible road corner', () => {
    const route = [
      { latitude: 56.0475, longitude: 51.958 },
      { latitude: 56.0475, longitude: 51.9582 },
      { latitude: 56.0477, longitude: 51.9582 },
    ];

    const smoothed = smoothRouteCoordinates(route);

    expect(smoothed[0]).toEqual(route[0]);
    expect(smoothed.at(-1)).toEqual(route.at(-1));
    expect(smoothed.length).toBeGreaterThan(route.length);
    expect(smoothed).not.toContainEqual(route[1]);
  });

  it('does not distort straight road segments', () => {
    const route = [
      { latitude: 56.0475, longitude: 51.958 },
      { latitude: 56.0475, longitude: 51.9582 },
      { latitude: 56.0475, longitude: 51.9584 },
    ];

    expect(smoothRouteCoordinates(route)).toEqual(route);
  });

  it('handles absent and two-point routes without inventing geometry', () => {
    const route = [
      { latitude: 56.0475, longitude: 51.958 },
      { latitude: 56.0477, longitude: 51.9582 },
    ];

    expect(smoothRouteCoordinates(null)).toEqual([]);
    expect(smoothRouteCoordinates(route)).toEqual(route);
  });
});
