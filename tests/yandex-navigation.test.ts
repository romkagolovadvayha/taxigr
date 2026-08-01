import { describe, expect, it } from 'vitest';

import {
  buildYandexMapsRouteUrl,
  buildYandexNavigatorRouteUrl,
} from '../src/domain/yandex-navigation';

describe('Yandex navigation links', () => {
  it('builds a Navigator route from the current location to the target', () => {
    expect(
      buildYandexNavigatorRouteUrl({
        latitude: 56.055332,
        longitude: 51.960263,
      }),
    ).toBe(
      'yandexnavi://build_route_on_map?lat_to=56.055332&lon_to=51.960263',
    );
  });

  it('builds a web route fallback for desktop browsers', () => {
    expect(
      buildYandexMapsRouteUrl({
        latitude: 56.055332,
        longitude: 51.960263,
      }),
    ).toBe(
      'https://yandex.ru/maps/?rtext=~56.055332%2C51.960263&rtt=auto',
    );
  });

  it('rejects invalid route coordinates', () => {
    expect(() =>
      buildYandexNavigatorRouteUrl({
        latitude: 91,
        longitude: 51.960263,
      }),
    ).toThrow('Некорректные координаты');
  });
});
