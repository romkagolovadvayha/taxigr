import { describe, expect, it } from 'vitest';

import { smoothRouteCoordinates } from '../src/components/map/route-geometry';
import { normalizeRouteStops } from '../src/domain/route-stops';
import { taxiMapScene } from '../src/components/map/map-scene';
import { formatRouteLabel } from '../src/domain/route-label';
import type { Address } from '../src/domain/models';

describe('route operations in browsers without Array.prototype.at', () => {
  it('keeps stop ordering, empty routes and route endpoints usable', () => {
    const a: Address = { id: 'a', label: 'Начало', coordinates: { latitude: 56.0475, longitude: 51.958 } };
    const b: Address = { id: 'b', label: 'Остановка', coordinates: { latitude: 56.0475, longitude: 51.9582 } };
    const c: Address = { id: 'c', label: 'Финиш', coordinates: { latitude: 56.0477, longitude: 51.9582 } };
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'at')!;
    const stringDescriptor = Object.getOwnPropertyDescriptor(String.prototype, 'replaceAll')!;
    const result = (() => {
      // eslint-disable-next-line no-extend-native -- Synchronously emulate the reported old browser, then restore it.
      Object.defineProperty(Array.prototype, 'at', { ...descriptor, value: undefined });
      // eslint-disable-next-line no-extend-native -- Chrome 79 also lacks String.replaceAll.
      Object.defineProperty(String.prototype, 'replaceAll', { ...stringDescriptor, value: undefined });
      try {
        return {
          stops: normalizeRouteStops(a, [a, b, b, c, a]),
          emptyStops: normalizeRouteStops(null, []),
          route: smoothRouteCoordinates([a.coordinates, b.coordinates, c.coordinates]),
          emptyRoute: smoothRouteCoordinates([]),
          navigation: taxiMapScene({ pickup: a, destinations: [b, c], routeCoordinates: [a.coordinates, b.coordinates, c.coordinates] }),
          label: formatRouteLabel({ label: 'с. Грахово, ул. Юбилейная, 5' }, { label: 'с. Грахово, ул. Ачинцева, 2а' }),
        };
      } finally {
        // eslint-disable-next-line no-extend-native -- Restore the original built-in before assertions or other tests run.
        Object.defineProperty(Array.prototype, 'at', descriptor);
        // eslint-disable-next-line no-extend-native -- Restore the original built-in before assertions or other tests run.
        Object.defineProperty(String.prototype, 'replaceAll', stringDescriptor);
      }
    })();
    expect(result.stops).toEqual([b, c, a]);
    expect(result.emptyStops).toEqual([]);
    expect(result.route[0]).toEqual(a.coordinates);
    expect(result.route[result.route.length - 1]).toEqual(c.coordinates);
    expect(result.emptyRoute).toEqual([]);
    expect(result.label).toBe('ул. Юбилейная, 5 → ул. Ачинцева, 2а');
    expect(result.navigation.points[2]?.coordinates).toEqual([51.9582, 56.0477]);
    expect(result.navigation.points[1]?.coordinates).toEqual([51.9582, 56.0475]);
  });
});
