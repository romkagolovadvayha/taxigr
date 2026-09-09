import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const origin = { latitude: 56.0477, longitude: 51.9586 };
const stop = { latitude: 56.04576, longitude: 51.96165 };
const destination = { latitude: 55.9995786, longitude: 51.8684492 };
const road = [[51.9586, 56.0477], [51.9586, 56.04576], [51.96165, 56.04576]];
const response = (overrides: Record<string, unknown> = {}) => new Response(JSON.stringify({
  code: 'Ok',
  routes: [{
    distance: 437.9, duration: 69.8,
    geometry: { type: 'LineString', coordinates: road },
    legs: [{ distance: 437.9 }],
    ...overrides,
  }],
}), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('demo road routing', () => {
  it('preserves the road bends and uses road distance instead of a straight-line estimate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    const route = await getDemoRoadRoute(origin, [stop]);
    expect(route).toEqual({
      source: 'osrm', distanceMeters: 438, durationSeconds: 70, segmentDistances: [438],
      coordinates: road.map(([longitude, latitude]) => ({ longitude, latitude })),
    });
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.pathname).toContain('51.9586,56.0477;51.96165,56.04576');
    expect(url.searchParams.get('overview')).toBe('full');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    await getDemoRoadRoute(origin, [stop]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests every stop in order in one route, preserving per-leg distances for fares', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      distance: 9800, legs: [{ distance: 438 }, { distance: 9362 }],
      geometry: { type: 'LineString', coordinates: [...road, [51.9, 56.01], [51.8684492, 55.9995786]] },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    const route = await getDemoRoadRoute(origin, [stop, destination]);
    expect(route.segmentDistances).toEqual([438, 9362]);
    expect(route.coordinates).toHaveLength(5);
    expect(fetchMock.mock.calls[0]![0]).toContain('51.9586,56.0477;51.96165,56.04576;51.8684492,55.9995786');
  });

  it.each([
    { geometry: undefined },
    { geometry: { type: 'LineString', coordinates: [road[0], null, road[2]] } },
    { geometry: { type: 'LineString', coordinates: [road[0], [181, 56], road[2]] } },
    { legs: [] },
    { legs: [{ distance: -1 }] },
    { distance: -1 },
  ])('rejects incomplete road responses without drawing a fallback line: %j', async (invalid) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)));
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    await expect(getDemoRoadRoute(origin, [stop])).rejects.toThrow('Не удалось построить маршрут по дорогам');
  });

  it('retries after an outage instead of caching an invented route', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    await expect(getDemoRoadRoute(origin, [stop])).rejects.toThrow('Не удалось построить маршрут по дорогам');
    expect((await getDemoRoadRoute(origin, [stop])).source).toBe('osrm');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('discards an old response after the user changes addresses', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    const controller = new AbortController();
    const request = getDemoRoadRoute(origin, [stop], controller.signal);
    controller.abort();
    resolve(response());
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts a slow request and presents a retryable error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
    })));
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    const request = getDemoRoadRoute(origin, [stop]);
    const assertion = expect(request).rejects.toThrow('Не удалось построить маршрут по дорогам');
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it('does not reject a valid short road just because it has two geometry points', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      geometry: { type: 'LineString', coordinates: [road[0], road[1]] },
    })));
    const { getDemoRoadRoute } = await import('../src/api/demo-routing');
    expect((await getDemoRoadRoute(origin, [stop])).coordinates).toHaveLength(2);
  });
});
