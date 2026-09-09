import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickupAddressAtCoordinates, resolvePickupAddress } from '../src/api/pickup-address';
import { isPickupAddressComplete } from '../src/domain/address-precision';

const coordinates = { latitude: 56.0477, longitude: 51.9586 };
const result = (kind = 'house') => ({
  GeoObject: {
    name: kind === 'house' ? 'улица Ачинцева, 5' : 'улица Ачинцева',
    Point: { pos: '51.9590 56.0480' },
    metaDataProperty: { GeocoderMetaData: {
      kind,
      text: 'Россия, Удмуртская Республика, Граховский район, село Грахово, улица Ачинцева',
      Address: { Components: [
        { kind: 'country', name: 'Россия' },
        { kind: 'locality', name: 'село Грахово' },
        { kind: 'street', name: 'улица Ачинцева' },
        ...(kind === 'house' ? [{ kind: 'house', name: '5' }] : []),
      ] },
    } },
  },
});
const mockResponse = (members = [result()]) => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { GeoObjectCollection: { featureMember: members } } }),
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('pickup address from device location', () => {
  it('reverse-geocodes longitude/latitude into a concrete street and house', async () => {
    const fetch = mockResponse();
    const address = await resolvePickupAddress(coordinates, { apiKey: 'test-key' });
    expect(address).toMatchObject({ label: 'село Грахово, улица Ачинцева, 5', houseNumber: '5' });
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.get('geocode')).toBe('51.9586,56.0477');
    expect(address?.coordinates).toEqual(coordinates);
    expect(isPickupAddressComplete(address)).toBe(true);
  });

  it('keeps the GPS pickup point and the known street when no house number exists', async () => {
    mockResponse([result('street')]);
    const address = await resolvePickupAddress(coordinates, { apiKey: 'test-key' });
    expect(address?.label).toBe('село Грахово, улица Ачинцева');
    expect(address?.houseNumber).toBeUndefined();
    expect(address?.coordinates).toEqual(coordinates);
    expect(isPickupAddressComplete(address)).toBe(true);
  });

  it('uses a backend street address without replacing GPS with the street centre', () => {
    const address = pickupAddressAtCoordinates({
      label: 'улица Ачинцева', details: 'село Грахово, Граховский район',
    }, coordinates);
    expect(address?.label).toBe('улица Ачинцева');
    expect(address?.coordinates).toEqual(coordinates);
    expect(address?.details).toContain('Граховский район');
    expect(address?.id).toMatch(/^location:/);
    expect(isPickupAddressComplete(address)).toBe(true);
  });

  it('does not treat a missing address or generic location label as a resolved address', async () => {
    mockResponse([]);
    await expect(resolvePickupAddress(coordinates, { apiKey: 'test-key' })).resolves.toBeNull();
    expect(pickupAddressAtCoordinates({ label: 'Моё местоположение' }, coordinates)).toBeNull();
    expect(pickupAddressAtCoordinates({ label: '  ' }, coordinates)).toBeNull();
  });

  it('allows backend fallback when the geocoder is not configured or is unavailable', async () => {
    const fetch = mockResponse();
    await expect(resolvePickupAddress(coordinates, {})).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue({ ok: false });
    await expect(resolvePickupAddress(coordinates, { apiKey: 'test-key' })).resolves.toBeNull();
  });

  it('cancels a lookup after leaving the screen and bounds network waiting', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')));
    })));
    const controller = new AbortController();
    const request = resolvePickupAddress(coordinates, { apiKey: 'test-key', signal: controller.signal });
    controller.abort();
    await expect(request).resolves.toBeNull();
    const timeout = resolvePickupAddress(coordinates, { apiKey: 'test-key' });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(timeout).resolves.toBeNull();
  });
});
