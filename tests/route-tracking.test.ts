import { describe, expect, it } from 'vitest';

import {
  headingBetweenCoordinates,
  remainingRouteCoordinates,
  routePositionAtProgress,
} from '../src/domain/route-tracking';

describe('route tracking', () => {
  const route = [
    { latitude: 56, longitude: 52 },
    { latitude: 56, longitude: 52.01 },
    { latitude: 55.99, longitude: 52.01 },
  ];

  it('interpolates a moving car by traveled distance and exposes its heading', () => {
    const position = routePositionAtProgress(route, 0.25);

    expect(position).not.toBeNull();
    expect(position!.coordinates.longitude).toBeGreaterThan(52);
    expect(position!.coordinates.longitude).toBeLessThan(52.01);
    expect(position!.heading).toBeCloseTo(90, 1);
  });

  it('removes route segments already passed by the driver', () => {
    const remaining = remainingRouteCoordinates(route, {
      latitude: 56.0001,
      longitude: 52.006,
    });

    expect(remaining).toHaveLength(3);
    expect(remaining[0]!.latitude).toBeCloseTo(56, 5);
    expect(remaining[0]!.longitude).toBeCloseTo(52.006, 5);
    expect(remaining).not.toContainEqual(route[0]);
    expect(remaining.at(-1)).toEqual(route.at(-1));
  });

  it('returns no completed line when the driver reaches the destination', () => {
    expect(remainingRouteCoordinates(route, route.at(-1))).toEqual([]);
  });

  it('calculates cardinal headings for the car icon', () => {
    expect(
      headingBetweenCoordinates(
        { latitude: 56, longitude: 52 },
        { latitude: 56.01, longitude: 52 },
      ),
    ).toBeCloseTo(0, 5);
  });
});
