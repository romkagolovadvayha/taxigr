import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  estimateRoute,
  GRAHOVO_DRIVER_BASE,
  getRouteMetrics,
  getPricedRouteMetrics,
  getMultiStopRouteMetrics,
  haversineMeters,
  parseOsrmRoute,
  type RouteMetrics,
} from '../server/routing';

const grahovo = { latitude: 56.04758, longitude: 51.95842 };
const mozhga = { latitude: 56.4439, longitude: 52.2274 };

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('requests full road geometry and does not cache an unavailable route', async () => {
    const origin = { latitude: 56.04111, longitude: 51.95111 };
    const destination = { latitude: 56.05222, longitude: 51.97222 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 2_400,
                duration: 300,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [origin.longitude, origin.latitude],
                    [51.96, 56.047],
                    [destination.longitude, destination.latitude],
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const unavailable = await getRouteMetrics(origin, destination);
    const recovered = await getRouteMetrics(origin, destination);

    expect(unavailable.source).toBe('estimate');
    expect(unavailable.coordinates).toEqual([]);
    expect(recovered.source).toBe('osrm');
    expect(recovered.coordinates).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('overview=full');
  });

  it('builds one ordered route through every destination', async () => {
    const pickup = {
      id: 'pickup',
      label: 'с. Грахово, ул. Ачинцева, 5',
      coordinates: grahovo,
    };
    const first = {
      id: 'first',
      label: 'с. Грахово, ул. Советская, 10',
      coordinates: { latitude: 56.05, longitude: 51.96 },
    };
    const second = {
      id: 'second',
      label: 'д. Поршур, ул. Бабаева, 32',
      details: 'Граховский район, Удмуртская Республика',
      coordinates: { latitude: 56.0248, longitude: 51.839 },
    };
    const calls: Array<{ origin: typeof grahovo; destination: typeof grahovo }> = [];

    const result = await getMultiStopRouteMetrics(
      pickup,
      [first, second],
      async (origin, destination) => {
        calls.push({ origin, destination });
        return {
          distanceMeters: 1_000 * calls.length,
          durationSeconds: 100 * calls.length,
          source: 'estimate',
          coordinates: [],
        };
      },
    );

    expect(calls).toEqual([
      { origin: pickup.coordinates, destination: first.coordinates },
      { origin: first.coordinates, destination: second.coordinates },
    ]);
    expect(result.tripRoute.distanceMeters).toBe(3_000);
    expect(result.tripRoute.durationSeconds).toBe(300);
    expect(result.tripRoute.coordinates).toEqual([]);
  });

  it('does not connect road segments with a direct line when one segment is unavailable', async () => {
    const pickup = {
      id: 'pickup',
      label: 'с. Грахово, ул. Ачинцева, 5',
      coordinates: grahovo,
    };
    const first = {
      id: 'first',
      label: 'с. Грахово, ул. Советская, 10',
      coordinates: { latitude: 56.05, longitude: 51.96 },
    };
    const second = {
      id: 'second',
      label: 'д. Поршур, ул. Бабаева, 32',
      coordinates: { latitude: 56.0248, longitude: 51.839 },
    };

    const result = await getMultiStopRouteMetrics(
      pickup,
      [first, second],
      async (_origin, destination) =>
        destination === first.coordinates
          ? {
              distanceMeters: 1_000,
              durationSeconds: 100,
              source: 'osrm',
              coordinates: [pickup.coordinates, first.coordinates],
            }
          : {
              distanceMeters: 2_000,
              durationSeconds: 200,
              source: 'estimate',
              coordinates: [],
            },
    );

    expect(result.tripRoute.source).toBe('estimate');
    expect(result.tripRoute.coordinates).toEqual([]);
  });
});

describe('pricing route from the driver base', () => {
  const tripRoute: RouteMetrics = {
    distanceMeters: 12_000,
    durationSeconds: 1_200,
    source: 'osrm',
    coordinates: [],
  };

  it('does not add the route from Grahovo when both points are in the district', async () => {
    const pickup = {
      id: 'porshur-pickup',
      label: 'д. Поршур, ул. Центральная, 1',
      details: 'Граховский район, Удмуртская Республика',
      coordinates: { latitude: 56.12, longitude: 51.82 },
    };
    const destination = {
      id: 'district-destination',
      label: 'д. Благодатное, ул. Центральная, 2',
      details: 'Граховский район, Удмуртская Республика',
      coordinates: { latitude: 55.9995, longitude: 51.8684 },
    };
    const driverApproachRoute: RouteMetrics = {
      distanceMeters: 8_000,
      durationSeconds: 800,
      source: 'osrm',
      coordinates: [],
    };
    const calls: { origin: typeof grahovo; destination: typeof grahovo }[] = [];
    const routes = [tripRoute, driverApproachRoute];

    const result = await getPricedRouteMetrics(
      pickup,
      destination,
      async (origin, routeDestination) => {
        calls.push({ origin, destination: routeDestination });
        return routes[calls.length - 1]!;
      },
    );

    expect(result.tripRoute).toBe(tripRoute);
    expect(result.driverApproachRoute).toBe(driverApproachRoute);
    expect(result.pricingDistanceMeters).toBe(12_000);
    expect(calls).toEqual([
      { origin: pickup.coordinates, destination: destination.coordinates },
      { origin: GRAHOVO_DRIVER_BASE, destination: pickup.coordinates },
    ]);
  });

  it('keeps a district trip price symmetric in both directions', async () => {
    const porshur = {
      id: 'porshur',
      label: 'д. Поршур, ул. Бабаева, 32',
      details: 'Граховский район, Удмуртская Республика',
      coordinates: { latitude: 56.0248498, longitude: 51.839 },
    };
    const grahovoAddress = {
      id: 'grahovo',
      label: 'с. Грахово, ул. Ачинцева, 5',
      details: 'Граховский район, Удмуртская Республика',
      coordinates: grahovo,
    };
    const approachRoute: RouteMetrics = {
      ...tripRoute,
      distanceMeters: 11_900,
    };

    const fromGrahovo = await getPricedRouteMetrics(
      grahovoAddress,
      porshur,
      async () => tripRoute,
    );
    const routes = [tripRoute, approachRoute];
    let call = 0;
    const toGrahovo = await getPricedRouteMetrics(
      porshur,
      grahovoAddress,
      async () => routes[call++]!,
    );

    expect(fromGrahovo.pricingDistanceMeters).toBe(12_000);
    expect(toGrahovo.driverApproachRoute).toBe(approachRoute);
    expect(toGrahovo.pricingDistanceMeters).toBe(12_000);
  });

  it('still adds the route from Grahovo for a pickup outside the district', async () => {
    const pickup = {
      id: 'mozhga-pickup',
      label: 'г. Можга, Привокзальная ул., 6',
      details: 'Можгинский район, Удмуртская Республика',
      coordinates: mozhga,
    };
    const destination = {
      id: 'izhevsk-destination',
      label: 'г. Ижевск, Центральная площадь',
      coordinates: { latitude: 56.8527, longitude: 53.2114 },
    };
    const approachRoute: RouteMetrics = {
      ...tripRoute,
      distanceMeters: 60_000,
    };
    const routes = [tripRoute, approachRoute];
    let call = 0;

    const result = await getPricedRouteMetrics(
      pickup,
      destination,
      async () => routes[call++]!,
    );

    expect(result.pricingDistanceMeters).toBe(72_000);
  });

  it('does not add an approach route when pickup is in Grahovo', async () => {
    const pickup = {
      id: 'grahovo-pickup',
      label: 'с. Грахово, ул. Ачинцева, 5',
      coordinates: { latitude: 56.0477, longitude: 51.9586 },
    };
    const destination = {
      id: 'mozhga-destination',
      label: 'г. Можга, Привокзальная ул., 6',
      coordinates: { latitude: 56.4456, longitude: 52.1972 },
    };
    let calls = 0;

    const result = await getPricedRouteMetrics(pickup, destination, async () => {
      calls += 1;
      return tripRoute;
    });

    expect(result.tripRoute).toBe(tripRoute);
    expect(result.driverApproachRoute).toBeNull();
    expect(result.pricingDistanceMeters).toBe(tripRoute.distanceMeters);
    expect(calls).toBe(1);
  });
});
