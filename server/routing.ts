import type { Address } from '../src/domain/models';
import { isGrahovoAddress } from '../src/domain/pricing';
import { config } from './config';

export type Point = { latitude: number; longitude: number };

export type RouteMetrics = {
  distanceMeters: number;
  durationSeconds: number;
  source: 'osrm' | 'estimate';
  coordinates: Point[];
};

export type PricedRouteMetrics = {
  tripRoute: RouteMetrics;
  driverApproachRoute: RouteMetrics | null;
  pricingDistanceMeters: number;
};

export const GRAHOVO_DRIVER_BASE: Point = {
  latitude: 56.04758,
  longitude: 51.95842,
};

type RouteMetricsResolver = (
  origin: Point,
  destination: Point,
) => Promise<RouteMetrics>;

type CacheEntry = {
  expiresAt: number;
  value: RouteMetrics;
};

const routeCache = new Map<string, CacheEntry>();
let routerUnavailableUntil = 0;

type OsrmResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { type?: string; coordinates?: unknown };
  }>;
};

export function haversineMeters(a: Point, b: Point): number {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function estimateRoute(origin: Point, destination: Point): RouteMetrics {
  const direct = haversineMeters(origin, destination);
  const distanceMeters = Math.max(800, Math.round(direct * 1.28));
  const averageMetersPerSecond = distanceMeters < 20_000 ? 10 : 16;
  return {
    distanceMeters,
    durationSeconds: Math.max(300, Math.round(distanceMeters / averageMetersPerSecond)),
    source: 'estimate',
    coordinates: [],
  };
}

function cacheKey(origin: Point, destination: Point): string {
  const point = ({ latitude, longitude }: Point) =>
    `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  return `${point(origin)}:${point(destination)}`;
}

function remember(key: string, value: RouteMetrics): RouteMetrics {
  if (routeCache.size >= config.ROUTER_CACHE_MAX_ENTRIES) {
    const oldest = routeCache.keys().next().value as string | undefined;
    if (oldest) routeCache.delete(oldest);
  }
  routeCache.set(key, {
    value,
    expiresAt: Date.now() + config.ROUTER_CACHE_TTL_SECONDS * 1_000,
  });
  return value;
}

export function parseOsrmRoute(body: OsrmResponse): RouteMetrics {
  const route = body.routes?.[0];
  const routeCoordinates = Array.isArray(route?.geometry?.coordinates)
    ? route.geometry.coordinates.flatMap((coordinate) => {
        if (
          !Array.isArray(coordinate) ||
          coordinate.length < 2 ||
          !Number.isFinite(coordinate[0]) ||
          !Number.isFinite(coordinate[1])
        ) {
          return [];
        }
        const longitude = Number(coordinate[0]);
        const latitude = Number(coordinate[1]);
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
        return [{ latitude, longitude }];
      })
    : [];
  if (
    body.code !== 'Ok' ||
    !route ||
    !Number.isFinite(route.distance) ||
    !Number.isFinite(route.duration) ||
    route.distance! <= 0 ||
    route.duration! <= 0 ||
    route.geometry?.type !== 'LineString' ||
    routeCoordinates.length < 2
  ) {
    throw new Error(`OSRM route is unavailable: ${body.code ?? 'unknown'}`);
  }
  return {
    distanceMeters: Math.round(route.distance!),
    durationSeconds: Math.round(route.duration!),
    source: 'osrm',
    coordinates: routeCoordinates,
  };
}

async function requestOsrm(origin: Point, destination: Point): Promise<RouteMetrics> {
  const coordinates = [
    `${origin.longitude},${origin.latitude}`,
    `${destination.longitude},${destination.latitude}`,
  ].join(';');
  const baseUrl = config.ROUTER_BASE_URL.replace(/\/$/, '');
  const response = await fetch(
    `${baseUrl}/route/v1/driving/${coordinates}?overview=simplified&geometries=geojson&steps=false&alternatives=false`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.ROUTER_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`OSRM returned ${response.status}`);
  return parseOsrmRoute((await response.json()) as OsrmResponse);
}

export async function getRouteMetrics(origin: Point, destination: Point): Promise<RouteMetrics> {
  const key = cacheKey(origin, destination);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) routeCache.delete(key);

  if (!config.ROUTER_BASE_URL || routerUnavailableUntil > Date.now()) {
    return remember(key, estimateRoute(origin, destination));
  }

  try {
    return remember(key, await requestOsrm(origin, destination));
  } catch {
    routerUnavailableUntil = Date.now() + config.ROUTER_CIRCUIT_BREAKER_SECONDS * 1_000;
    return remember(key, estimateRoute(origin, destination));
  }
}

export async function getPricedRouteMetrics(
  pickup: Address,
  destination: Address,
  resolveRoute: RouteMetricsResolver = getRouteMetrics,
): Promise<PricedRouteMetrics> {
  const tripRoutePromise = resolveRoute(pickup.coordinates, destination.coordinates);
  const driverApproachRoutePromise = isGrahovoAddress(pickup)
    ? Promise.resolve<RouteMetrics | null>(null)
    : resolveRoute(GRAHOVO_DRIVER_BASE, pickup.coordinates);
  const [tripRoute, driverApproachRoute] = await Promise.all([
    tripRoutePromise,
    driverApproachRoutePromise,
  ]);

  return {
    tripRoute,
    driverApproachRoute,
    pricingDistanceMeters:
      tripRoute.distanceMeters + (driverApproachRoute?.distanceMeters ?? 0),
  };
}
