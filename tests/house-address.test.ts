import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveHouseAddress } from '../src/api/house-address';
import { clearApiCache } from '../src/api/client';
import type { Address } from '../src/domain/models';

const address: Address = { id: 'gar:example', label: 'д. Благодатное, ул. Благодатновская, 1', houseNumber: '1',
  coordinatePrecision: 'approximate', coordinates: { latitude: 56, longitude: 51.87 } };
// Synthetic provider response for matching tests; not imported into the catalogue.
const result: Address = { id: 'osm-test', label: 'Благодатновская улица, 1', details: 'деревня Благодатное', houseNumber: '1',
  coordinates: { latitude: 56.001, longitude: 51.87 } };
function mockResponse(data: Address[]) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) }); vi.stubGlobal('fetch', fetch); return fetch;
}
beforeEach(async () => {
  await clearApiCache();
  vi.stubGlobal('window', { location: { hostname: 'localhost' } });
});
afterEach(() => vi.unstubAllGlobals());

describe('selected house resolution', () => {
  it('explicitly resolves a selected approximate house before asking for a map point', async () => {
    const fetch = mockResponse([result]);
    expect(await resolveHouseAddress(address, { token: 'session-token' })).toMatchObject({
      id: result.id, label: address.label, coordinates: result.coordinates, coordinatePrecision: 'precise' });
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.get('kind')).toBe('house');
  });
  it('rejects another house, another locality, street centres and remote matches', async () => {
    mockResponse([{ ...result, houseNumber: '10' }, { ...result, details: 'село Грахово' },
      { ...result, coordinatePrecision: 'approximate' }, { ...result, houseNumber: undefined, label: 'Благодатновская улица' },
      { ...result, coordinates: { latitude: 57, longitude: 52 } }]);
    expect(await resolveHouseAddress(address, { token: 'demo:passenger' })).toBeNull();
  });
  it('rejects ambiguous distant matches', async () => {
    mockResponse([result, { ...result, coordinates: { latitude: 56.009, longitude: 51.87 } }]);
    expect(await resolveHouseAddress(address, { token: 'demo:passenger' })).toBeNull();
  });
  it('preserves a known mapped address without any network call', async () => {
    const fetch = mockResponse([]);
    expect(await resolveHouseAddress(result, { token: 'demo:passenger' })).toEqual(result);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the fallback when the provider fails or selection is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await resolveHouseAddress(address, { token: 'demo:passenger' })).toBeNull();
    expect(await resolveHouseAddress(address, { token: 'demo:passenger', signal: AbortSignal.abort() })).toBeNull();
  });
});
