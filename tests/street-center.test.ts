import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveStreetCenter } from '../src/api/street-center';
import type { Address } from '../src/domain/models';

const street: Address = {
  id: 'gar:kokshan-novaya',
  label: 'д. Кокшан, ул. Новая',
  kind: 'street',
  coordinates: { latitude: 56.1113066, longitude: 52.125052 },
};
const result = (kind = 'street', text = 'деревня Кокшан, Новая улица', pos = '52.125607 56.115589') => ({
  GeoObject: { Point: { pos }, metaDataProperty: { GeocoderMetaData: { kind, text } } },
});
const mockResponse = (members = [result()]) => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { GeoObjectCollection: { featureMember: members } } }),
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('street center for house point selection', () => {
  it('finds the selected street inside the selected settlement', async () => {
    const fetch = mockResponse();
    await expect(resolveStreetCenter(street, { apiKey: 'test-key' })).resolves.toEqual({
      latitude: 56.115589, longitude: 52.125607,
    });
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('geocode')).toBe(street.label);
    expect(url.searchParams.get('ll')).toBe('52.125052,56.1113066');
    expect(url.searchParams.get('rspn')).toBe('1');
  });

  it('does not mistake a settlement or a different town/street for the requested street', async () => {
    mockResponse([
      result('locality'),
      result('street', 'деревня Каменное, Новая улица'),
      result('street', 'деревня Кокшан, Грузлевская улица'),
    ]);
    await expect(resolveStreetCenter(street, { apiKey: 'test-key' })).resolves.toBeNull();
  });

  it('ignores malformed coordinates and uses a valid street result', async () => {
    mockResponse([result('street', undefined, 'NaN 56'), result('street', undefined, '52 99'), result()]);
    await expect(resolveStreetCenter(street, { apiKey: 'test-key' })).resolves.toEqual({
      latitude: 56.115589, longitude: 52.125607,
    });
  });

  it('keeps the existing anchor available when the key is missing or the service fails', async () => {
    const fetch = mockResponse();
    await expect(resolveStreetCenter(street, {})).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue({ ok: false });
    await expect(resolveStreetCenter(street, { apiKey: 'test-key' })).resolves.toBeNull();
  });

  it('cancels lookup when leaving the point picker and bounds the wait to five seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }: RequestInit) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('Aborted')));
    })));
    const controller = new AbortController();
    const canceled = resolveStreetCenter(street, { apiKey: 'test-key', signal: controller.signal });
    controller.abort();
    await expect(canceled).resolves.toBeNull();
    const timedOut = resolveStreetCenter(street, { apiKey: 'test-key' });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(timedOut).resolves.toBeNull();
  });
});
