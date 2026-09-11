import { beforeEach, expect, it, vi } from 'vitest';

const setSize = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('@maplibre/maplibre-react-native', () => ({ OfflineManager: { setMaximumAmbientCacheSize: setSize } }));
beforeEach(() => { vi.resetModules(); setSize.mockReset(); });

it('shares cache setup between simultaneously mounted maps without blocking their caller', async () => {
  let finish!: () => void;
  setSize.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { configureNativeMapCache } = await import('../src/components/map/map-cache.native');
  const first = configureNativeMapCache();
  expect(configureNativeMapCache()).toBe(first);
  expect(setSize).toHaveBeenCalledTimes(1);
  expect(setSize).toHaveBeenCalledWith(128 * 1024 * 1024);
  finish(); await first;
  await configureNativeMapCache();
  expect(setSize).toHaveBeenCalledTimes(1);
});

it('keeps map loading possible after a disk error and retries on the next mount', async () => {
  setSize.mockRejectedValueOnce(new Error('disk unavailable')).mockResolvedValueOnce(undefined);
  const { configureNativeMapCache } = await import('../src/components/map/map-cache.native');
  await expect(configureNativeMapCache()).resolves.toBeUndefined();
  await expect(configureNativeMapCache()).resolves.toBeUndefined();
  expect(setSize).toHaveBeenCalledTimes(2);
});
