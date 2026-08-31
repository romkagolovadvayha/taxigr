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

  it('keeps every selected stop in Navigator and Maps route order', () => {
    const origin = { latitude: 56.044885, longitude: 51.962273 };
    const stops = [
      { latitude: 56.049, longitude: 51.959 },
      { latitude: 56.055332, longitude: 51.960263 },
    ];

    expect(buildYandexNavigatorRouteUrl(stops, origin)).toBe(
      'yandexnavi://build_route_on_map?lat_from=56.044885&lon_from=51.962273&lat_to=56.055332&lon_to=51.960263&lat_via_0=56.049&lon_via_0=51.959',
    );
    expect(buildYandexMapsRouteUrl(stops, origin)).toBe(
      'https://yandex.ru/maps/?rtext=56.044885%2C51.962273~56.049%2C51.959~56.055332%2C51.960263&rtt=auto',
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
