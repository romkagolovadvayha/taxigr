import vkBridge from '@vkontakte/vk-bridge';

import { validMapCoordinate } from '../domain/map-coordinates';
import { loadMiniAppBridge } from '../mini-apps/bridge';
import { getEmbeddedAppProvider } from '../mini-apps/runtime';
import { ensureLocationConsent } from './location-disclosure';
import type { PickupPosition } from './pickup-position';
import { confirmVkPickupConsent } from './vk-pickup-consent.web';

function bounded<T>(signal: AbortSignal, timeout: number, start: (finish: (result: T) => void) => void) {
  return new Promise<T | 'unavailable'>((resolve) => {
    const finish = (result: T | 'unavailable') => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => finish('unavailable');
    const timer = setTimeout(cancel, timeout);
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    try { start(finish); } catch { cancel(); }
  });
}

async function telegramPosition(signal: AbortSignal): Promise<PickupPosition | null> {
  const bridge = await loadMiniAppBridge('telegram');
  const manager = bridge.LocationManager;
  if (!manager || bridge.isVersionAtLeast?.('8.0') === false) return null;

  if (!manager.isInited) {
    const ready = await bounded<boolean>(signal, 3_000, finish => manager.init(() => finish(true)));
    if (ready !== true) return null;
  }
  if (!manager.isLocationAvailable) return null;
  return bounded<PickupPosition>(signal, 20_000, finish => {
    manager.getLocation(position => finish(position ?? 'denied'));
  });
}

async function vkPosition(signal: AbortSignal): Promise<PickupPosition | null> {
  const method = 'VKWebAppGetGeodata';
  if (!vkBridge.isEmbedded()) return null;
  // Web hosts may omit SetSupportedHandlers even when they handle GetGeodata.
  // In a native VK WebView the SDK can check the installed handler directly.
  if (vkBridge.isWebView() && !await vkBridge.supportsAsync(method)) return null;
  const position = await bounded<PickupPosition>(signal, 20_000, finish => {
    void vkBridge.send(method).then(result => {
      if (Number(result?.available) !== 1 || !('lat' in result)) { finish('unavailable'); return; }
      const latitude = vkCoordinate(result.lat);
      const longitude = vkCoordinate(result.long);
      const coordinates = { latitude, longitude };
      finish(validMapCoordinate(coordinates) ? coordinates : 'unavailable');
    }, error => {
      finish(error?.error_type === 'client_error' && Number(error.error_data?.error_code) === 4 ? 'denied' : 'unavailable');
    });
  });
  return position === 'unavailable' ? null : position;
}

function vkCoordinate(value: unknown): number {
  if (typeof value === 'number') return value;
  return typeof value === 'string' && value.trim() ? Number(value) : NaN;
}

function browserPosition(signal: AbortSignal): Promise<PickupPosition> {
  return bounded<PickupPosition>(signal, 20_000, finish => {
    const geolocation = navigator.geolocation;
    if (!geolocation) { finish('unavailable'); return; }
    geolocation.getCurrentPosition(
      ({ coords }) => finish({ latitude: coords.latitude, longitude: coords.longitude }),
      error => finish(error.code === 1 ? 'denied' : 'unavailable'),
      { maximumAge: 60_000, timeout: 12_000 },
    );
  });
}

export async function requestPickupPosition(signal: AbortSignal): Promise<PickupPosition> {
  const provider = getEmbeddedAppProvider();
  const consent = await ensureLocationConsent('pickup', provider === 'vk' ? () => confirmVkPickupConsent(signal) : undefined);
  if (!consent) return provider === 'vk' ? 'unavailable' : 'denied';
  if (signal.aborted) return 'unavailable';

  const embedded = provider === 'telegram' ? await telegramPosition(signal) :
    provider === 'vk' ? await vkPosition(signal) : null;
  const position = embedded ?? await browserPosition(signal);
  return typeof position === 'string' || validMapCoordinate(position) ? position : 'unavailable';
}
