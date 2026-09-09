import type { Coordinates, RouteSummary } from '../domain/models';

type DemoRoadRoute = RouteSummary & { segmentDistances: number[] };
type OsrmResponse = {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: { type?: string; coordinates?: unknown };
    legs?: { distance?: number }[];
  }[];
};

// Demo sessions have no API session or local database. Only demo coordinates are
// sent to the public OSRM demo service; real orders still use the authenticated API.
const ROUTER_URL = 'https://router.project-osrm.org/route/v1/driving/';
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 64;
const REQUEST_TIMEOUT_MS = 8_000;
const cache = new Map<string, { expiresAt: number; route: DemoRoadRoute }>();

function validPoint(point: Coordinates): boolean {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

function aborted(): Error {
  return Object.assign(new Error('Запрос маршрута отменён'), { name: 'AbortError' });
}

export async function getDemoRoadRoute(
  origin: Coordinates,
  destinations: readonly Coordinates[],
  signal?: AbortSignal,
): Promise<DemoRoadRoute> {
  if (signal?.aborted) throw aborted();
  const points = [origin, ...destinations];
  if (!destinations.length || !points.every(validPoint)) {
    throw new Error('Уточните точки маршрута');
  }
  const key = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now()) return saved.route;

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${ROUTER_URL}${key}?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=false`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error('Router unavailable');
    const body = await response.json() as OsrmResponse | null;
    const route = body?.routes?.[0];
    const geometry = route?.geometry;
    const rawPoints = geometry?.coordinates;
    // Reject incomplete geometry instead of joining either side of a missing
    // section with a straight line. Two points can still be a valid straight road.
    if (
      body?.code !== 'Ok' || !route || geometry?.type !== 'LineString' ||
      !Array.isArray(rawPoints) || rawPoints.length < 2 ||
      !rawPoints.every((point) => Array.isArray(point) && point.length >= 2 &&
        validPoint({ longitude: point[0], latitude: point[1] })) ||
      !Number.isFinite(route.distance) || route.distance! < 0 ||
      !Number.isFinite(route.duration) || route.duration! < 0 ||
      !Array.isArray(route.legs) || route.legs.length !== destinations.length ||
      !route.legs.every((leg) => Number.isFinite(leg?.distance) && leg.distance! >= 0)
    ) throw new Error('Incomplete road route');

    if (controller.signal.aborted) throw aborted();
    const result: DemoRoadRoute = {
      source: 'osrm',
      distanceMeters: Math.round(route.distance!),
      durationSeconds: Math.round(route.duration!),
      coordinates: rawPoints.map(([longitude, latitude]) => ({ longitude, latitude })),
      segmentDistances: route.legs.map((leg) => Math.round(leg.distance!)),
    };
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { route: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    if (signal?.aborted) throw aborted();
    throw new Error('Не удалось построить маршрут по дорогам. Проверьте интернет и повторите расчёт.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
