import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
import { readDemoAddressPoints, rememberDemoAddress } from '../src/storage/demo-address-points';
import { rememberAddressPoint } from '../src/api/remember-address';
import type { Address } from '../src/domain/models';

const address: Address = { id: 'manual:test', label: 'с. Грахово, ул. Тестовая, 999', houseNumber: '999',
  coordinatePrecision: 'approximate', coordinates: { latitude: 56, longitude: 52 } };
const values = new Map<string, string>();
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
beforeEach(() => {
  values.clear();
  vi.stubEnv('EXPO_OS', 'web');
  vi.stubGlobal('window', { location: { hostname: 'localhost' }, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
});

describe('address confirmation persistence', () => {
  it('reloads the saved demo point and handles simultaneous repeated confirmations', async () => {
    const [first, second] = await Promise.all([
      rememberDemoAddress(address, { latitude: 56.001, longitude: 52 }),
      rememberDemoAddress(address, { latitude: 56.001, longitude: 52 }),
    ]);
    expect(second).toEqual(first);
    expect(await readDemoAddressPoints()).toEqual([first]);
  });
  it('reports a storage failure and permits a subsequent retry', async () => {
    const writer = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('storage full'); };
    await expect(rememberDemoAddress(address, address.coordinates)).rejects.toThrow('storage full');
    window.localStorage.setItem = writer;
    await rememberDemoAddress(address, address.coordinates);
    expect(await readDemoAddressPoints()).toHaveLength(1);
  });
  it('saves authenticated confirmations to the server', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { ...address, id: 'saved-house:example' } })));
    vi.stubGlobal('fetch', fetch);
    expect((await rememberAddressPoint(address, address.coordinates, 'session-token')).id).toBe('saved-house:example');
    expect(fetch.mock.calls[0]).toMatchObject(['http://localhost:4100/v1/addresses/points', {
      method: 'POST', headers: { Authorization: 'Bearer session-token' },
    }]);
  });
  it('never sends demo points to the shared database and propagates network errors', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
    await rememberAddressPoint(address, address.coordinates, 'demo:passenger');
    expect(fetch).not.toHaveBeenCalled();
    await expect(rememberAddressPoint(address, address.coordinates, 'session-token')).rejects.toThrow('Нет связи');
    await expect(rememberAddressPoint(address, address.coordinates, null)).rejects.toThrow('Войдите');
  });
});
