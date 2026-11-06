import vkBridge from '@vkontakte/vk-bridge';

import { validMapCoordinate } from '@/domain/map-coordinates';
import { loadMiniAppBridge } from '@/mini-apps/bridge';
import { getEmbeddedAppProvider } from '@/mini-apps/runtime';
import { ensureLocationConsent } from './location-disclosure';
import type { PickupPosition } from './pickup-position';

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
  const supported = await bounded<boolean>(signal, 3_000, finish => {
    void vkBridge.supportsAsync(method).then(finish, () => finish(false));
  });
  if (supported !== true) return null;
  return bounded<PickupPosition>(signal, 20_000, finish => {
    void vkBridge.send(method).then(result => {
      finish(result.available ? { latitude: result.lat, longitude: result.long } : 'denied');
    }, error => {
      finish(error?.error_type === 'client_error' && error.error_data?.error_code === 4 ? 'denied' : 'unavailable');
    });
  });
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
  if (!await ensureLocationConsent('pickup')) return 'denied';
  if (signal.aborted) return 'unavailable';

  const provider = getEmbeddedAppProvider();
  const embedded = provider === 'telegram' ? await telegramPosition(signal) :
    provider === 'vk' ? await vkPosition(signal) : null;
  const position = embedded ?? await browserPosition(signal);
  return typeof position === 'string' || validMapCoordinate(position) ? position : 'unavailable';
}
