import * as Linking from 'expo-linking';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openYandexMaps, openYandexNavigation } from '../src/utils/open-yandex-navigation';
import { yandexNavigationUrls } from '../src/domain/external-navigation';
import type { Address } from '../src/domain/models';

vi.mock('expo-linking', () => ({ openURL: vi.fn(), canOpenURL: vi.fn(() => false) }));
const address: Address = { id: 'osm-house', label: 'Грахово Ачинцева 11', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const urls = yandexNavigationUrls(address);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Linking.openURL).mockReset().mockResolvedValue(true);
  vi.stubEnv('EXPO_OS', 'android');
  vi.stubGlobal('navigator', { userAgent: 'Desktop Chrome', maxTouchPoints: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('opening Yandex navigation', () => {
  it.each(['android', 'ios'])('launches Navigator directly on %s without an installation-check false negative', async platform => {
    vi.stubEnv('EXPO_OS', platform);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(openYandexNavigation(address)).resolves.toBe('navigator');
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(urls.navigator);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('opens Maps with the same destination if Navigator is absent', async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No matching activity'));
    await expect(openYandexNavigation(address)).resolves.toBe('maps');
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, urls.navigator);
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, urls.maps);
  });
  it('reports both apps failing instead of silently swallowing the failure', async () => {
    vi.mocked(Linking.openURL).mockRejectedValue(new Error('Cannot open URL'));
    await expect(openYandexNavigation(address)).rejects.toThrow('Cannot open URL');
    expect(Linking.openURL).toHaveBeenCalledTimes(2);
  });
  it('allows Maps to be selected explicitly without retrying Navigator', async () => {
    await openYandexMaps(address);
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(urls.maps);
  });
  it('opens a browser map synchronously during the click and severs window.opener', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const tab = { opener: {} };
    const open = vi.fn(() => tab);
    vi.stubGlobal('window', { open, location: { assign: vi.fn() } });
    const promise = openYandexNavigation(address);
    expect(open).toHaveBeenCalledExactlyOnceWith(urls.maps, '_blank');
    expect(tab.opener).toBeNull();
    await expect(promise).resolves.toBe('maps');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it('falls back to the same tab if the browser blocks a popup', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const assign = vi.fn();
    vi.stubGlobal('window', { open: vi.fn(() => null), location: { assign } });
    await openYandexNavigation(address);
    expect(assign).toHaveBeenCalledExactlyOnceWith(urls.maps);
  });
  it('opens an Android browser intent with a Maps fallback during the original tap', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Android Chrome', maxTouchPoints: 5 });
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign }, open: vi.fn() });
    await expect(openYandexNavigation(address)).resolves.toBe('navigator');
    const intent = assign.mock.calls[0]![0] as string;
    expect(intent).toContain('intent://build_route_on_map?lat_to=56.0477&lon_to=51.9586#Intent;');
    expect(intent).toContain('package=ru.yandex.yandexnavi;');
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(urls.maps)};end`);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it.each([
    ['iPhone Safari', 5], ['iPad Safari', 5], ['Macintosh Safari', 5],
    ['iPhone Telegram WebView', 5], ['iPhone MAX WebView', 5], ['iPhone VK WebView', 5],
  ])('opens Navigator in the mobile browser %s', async (userAgent, maxTouchPoints) => {
    vi.stubEnv('EXPO_OS', 'web');
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints });
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign }, open: vi.fn() });
    await expect(openYandexNavigation(address)).resolves.toBe('navigator');
    expect(assign).toHaveBeenCalledExactlyOnceWith(urls.navigator);
  });
  it('keeps the explicit Maps action usable in a messenger that rejects app schemes', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    vi.stubGlobal('navigator', { userAgent: 'iPhone WebView', maxTouchPoints: 5 });
    const assign = vi.fn(() => { throw new Error('Unsupported scheme'); });
    const open = vi.fn(() => ({ opener: null }));
    vi.stubGlobal('window', { location: { assign }, open });
    await expect(openYandexNavigation(address)).resolves.toBe('maps');
    expect(open).toHaveBeenCalledWith(urls.maps, '_blank');
  });
});
