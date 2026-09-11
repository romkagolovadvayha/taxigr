import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickupAddressAtCoordinates, resolvePickupAddress } from '../src/api/pickup-address';
import { isPickupAddressComplete } from '../src/domain/address-precision';

const coordinates = { latitude: 56.0477, longitude: 51.9586 };
const result = { id: 'osm-house', label: 'улица Ачинцева, 5', houseNumber: '5', details: 'село Грахово',
  kind: 'house', coordinates: { latitude: 56.048, longitude: 51.959 } };
const mockResponse = (data: unknown = [result]) => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) });
  vi.stubGlobal('fetch', fetch); return fetch;
};
beforeEach(() => vi.stubGlobal('window', { location: { hostname: 'localhost' } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('pickup address without a map-provider key', () => {
  it('reverse-geocodes on our API while retaining the exact GPS position', async () => {
    const fetch = mockResponse();
    const address = await resolvePickupAddress(coordinates, { token: 'session-token' });
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.origin).toBe('http://localhost:4100');
    expect(url.pathname).toBe('/v1/addresses/search');
    expect(url.searchParams.get('query')).toBe('51.9586,56.0477');
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe('Bearer session-token');
    expect(address).toMatchObject({ label: result.label, houseNumber: '5', coordinates });
    expect(isPickupAddressComplete(address)).toBe(true);
  });
  it('uses the local preview endpoint without transmitting a demo token', async () => {
    const fetch = mockResponse([{ ...result, houseNumber: undefined, label: 'улица Ачинцева' }]);
    const address = await resolvePickupAddress(coordinates, { token: 'demo:passenger' });
    expect(new URL(fetch.mock.calls[0]![0]).pathname).toBe('/v1/addresses/preview');
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBeUndefined();
    expect(address?.coordinates).toEqual(coordinates);
  });
  it('rejects empty, generic and invalid GPS addresses', async () => {
    mockResponse([]);
    await expect(resolvePickupAddress(coordinates, { token: 'demo:passenger' })).resolves.toBeNull();
    expect(pickupAddressAtCoordinates({ label: 'Моё местоположение' }, coordinates)).toBeNull();
    expect(pickupAddressAtCoordinates({ label: ' ' }, coordinates)).toBeNull();
    expect(pickupAddressAtCoordinates(result, { latitude: NaN, longitude: 52 })).toBeNull();
  });
  it('does not send a request without a session or after cancellation', async () => {
    const fetch = mockResponse();
    await expect(resolvePickupAddress(coordinates, {})).resolves.toBeNull();
    const abort = new AbortController(); abort.abort();
    await expect(resolvePickupAddress(coordinates, { token: 'demo:passenger', signal: abort.signal })).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns control to manual address selection after server errors', async () => {
    const fetch = mockResponse();
    fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(resolvePickupAddress(coordinates, { token: 'demo:passenger' })).resolves.toBeNull();
    mockResponse({ unexpected: true });
    await expect(resolvePickupAddress(coordinates, { token: 'demo:passenger' })).resolves.toBeNull();
  });
  it('cancels when leaving the screen and limits the request to five seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')));
    })));
    const controller = new AbortController();
    const request = resolvePickupAddress(coordinates, { token: 'demo:passenger', signal: controller.signal });
    controller.abort(); await expect(request).resolves.toBeNull();
    const timeout = resolvePickupAddress(coordinates, { token: 'demo:passenger' });
    await vi.advanceTimersByTimeAsync(5000); await expect(timeout).resolves.toBeNull();
  });
});
