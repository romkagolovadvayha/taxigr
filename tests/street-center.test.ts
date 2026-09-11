import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveStreetCenter } from '../src/api/street-center';
import type { Address } from '../src/domain/models';

const street: Address = { id: 'gar:kokshan-novaya', label: 'д. Кокшан, ул. Новая', kind: 'street',
  coordinates: { latitude: 56.1113066, longitude: 52.125052 } };
const result: Address = { id: 'osm-street', label: 'Новая улица', details: 'деревня Кокшан', kind: 'street',
  coordinates: { latitude: 56.115589, longitude: 52.125607 } };
function mockResponse(data: unknown = [result]) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) }); vi.stubGlobal('fetch', fetch); return fetch;
}
beforeEach(() => vi.stubGlobal('window', { location: { hostname: 'localhost' } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('street center for map point selection', () => {
  it('requests actual street geometry through our authenticated API', async () => {
    const fetch = mockResponse();
    await expect(resolveStreetCenter(street, { token: 'session-token' })).resolves.toEqual(result.coordinates);
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.pathname).toBe('/v1/addresses/search');
    expect(url.searchParams.get('query')).toBe(street.label);
    expect(url.searchParams.get('kind')).toBe('street');
  });
  it('rejects a settlement, a different street and an identically named faraway settlement', async () => {
    mockResponse([
      { ...result, kind: 'settlement' },
      { ...result, details: 'деревня Каменное' },
      { ...result, label: 'Грузлевская улица' },
      { ...result, coordinates: { latitude: 59, longitude: 55 } },
    ]);
    await expect(resolveStreetCenter(street, { token: 'demo:passenger' })).resolves.toBeNull();
  });
  it('skips malformed coordinates', async () => {
    mockResponse([{ ...result, coordinates: { latitude: NaN, longitude: 52 } }, { ...result, coordinates: { latitude: 99, longitude: 52 } }, result]);
    await expect(resolveStreetCenter(street, { token: 'demo:passenger' })).resolves.toEqual(result.coordinates);
  });
  it('keeps the current anchor usable when the service is unavailable', async () => {
    const fetch = mockResponse();
    await expect(resolveStreetCenter(street, {})).resolves.toBeNull(); expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValue(new Error('offline'));
    await expect(resolveStreetCenter(street, { token: 'demo:passenger' })).resolves.toBeNull();
  });
  it('aborts a pending lookup and does not overwrite a newly selected point', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')));
    })));
    const controller = new AbortController();
    const request = resolveStreetCenter(street, { token: 'demo:passenger', signal: controller.signal });
    controller.abort(); await expect(request).resolves.toBeNull();
  });
});
