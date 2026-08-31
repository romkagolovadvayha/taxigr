import { describe, expect, it } from 'vitest';

import {
  distanceBetweenCoordinates,
  drawableNavigationRoute,
  formatNavigationDistance,
  navigationPositionBucket,
} from '../src/domain/navigation';

const origin = { latitude: 56.04758, longitude: 51.95842 };
const target = { latitude: 56.055332, longitude: 51.960263 };

describe('driver navigation helpers', () => {
  it('measures movement and groups nearby GPS updates for route rebuilding', () => {
    expect(distanceBetweenCoordinates(origin, target)).toBeGreaterThan(800);
    expect(navigationPositionBucket(origin)).toBe('56.048:51.958');
    expect(
      navigationPositionBucket({ latitude: 56.04759, longitude: 51.95844 }),
    ).toBe(navigationPositionBucket(origin));
  });

  it('keeps road geometry and never presents a direct segment as a road route', () => {
    const road = [origin, { latitude: 56.05, longitude: 51.959 }, target];
    expect(drawableNavigationRoute(road)).toBe(road);
    expect(drawableNavigationRoute([])).toEqual([]);
  });

  it('formats remaining distance for a quick glance', () => {
    expect(formatNavigationDistance(247)).toBe('250 м');
    expect(formatNavigationDistance(1_250)).toBe('1,3 км');
    expect(formatNavigationDistance(12_500)).toBe('13 км');
  });
});
