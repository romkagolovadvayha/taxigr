import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestPickupPosition } from '../src/location/pickup-position.web';

const vk = vi.hoisted(() => ({
  isEmbedded: vi.fn(), isWebView: vi.fn(), supportsAsync: vi.fn(), send: vi.fn(),
}));
const consent = vi.hoisted(() => ({ request: vi.fn(), dialog: vi.fn() }));
vi.mock('@vkontakte/vk-bridge', () => ({ default: vk }));
vi.mock('../src/mini-apps/runtime', () => ({ getEmbeddedAppProvider: () => 'vk' }));
vi.mock('../src/location/location-disclosure', () => ({ ensureLocationConsent: consent.request }));
vi.mock('../src/location/vk-pickup-consent.web', () => ({ confirmVkPickupConsent: consent.dialog }));

const position = { latitude: 56.05132, longitude: 51.96821 };
const browserPosition = vi.fn<Geolocation['getCurrentPosition']>();
const controller = () => new AbortController().signal;

beforeEach(() => {
  vi.resetAllMocks();
  vk.isEmbedded.mockReturnValue(true);
  vk.isWebView.mockReturnValue(false);
  vk.supportsAsync.mockResolvedValue(true);
  consent.request.mockImplementation((_purpose, confirm) => confirm());
  consent.dialog.mockResolvedValue(true);
  browserPosition.mockImplementation(success => success({ coords: position } as GeolocationPosition));
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: browserPosition } });
});
afterEach(() => vi.unstubAllGlobals());

describe('VK passenger geolocation', () => {
  it('requests geodata even when an iframe host omits the capabilities list', async () => {
    vk.supportsAsync.mockResolvedValue(false);
    vk.send.mockResolvedValue({ available: 1, lat: '56.05132', long: '51.96821' });
    await expect(requestPickupPosition(controller())).resolves.toEqual(position);
    expect(vk.send).toHaveBeenCalledWith('VKWebAppGetGeodata');
    expect(vk.supportsAsync).not.toHaveBeenCalled();
    expect(browserPosition).not.toHaveBeenCalled();
  });

  it('requests the native iPhone handler and accepts coordinates as strings', async () => {
    vk.isWebView.mockReturnValue(true);
    vk.send.mockResolvedValue({ available: 1, lat: '56.05132', long: '51.96821' });
    await expect(requestPickupPosition(controller())).resolves.toEqual(position);
    expect(vk.supportsAsync).toHaveBeenCalledWith('VKWebAppGetGeodata');
    expect(browserPosition).not.toHaveBeenCalled();
  });

  it.each([{ available: 0 }, { available: '0' }, { available: 1, lat: ' ', long: '51.96821' }])(
    'tries the web view location API when VK cannot give valid coordinates (%o)', async result => {
      vk.send.mockResolvedValue(result);
      await expect(requestPickupPosition(controller())).resolves.toEqual(position);
      expect(browserPosition).toHaveBeenCalledOnce();
    },
  );

  it('falls back to the web view location API if the native handler is absent', async () => {
    vk.isWebView.mockReturnValue(true);
    vk.supportsAsync.mockResolvedValue(false);
    await expect(requestPickupPosition(controller())).resolves.toEqual(position);
    expect(vk.send).not.toHaveBeenCalled();
    expect(browserPosition).toHaveBeenCalledOnce();
  });

  it('does not request a second permission after VK explicitly denies access', async () => {
    vk.send.mockRejectedValue({ error_type: 'client_error', error_data: { error_code: 4 } });
    await expect(requestPickupPosition(controller())).resolves.toBe('denied');
    expect(browserPosition).not.toHaveBeenCalled();
  });

  it('does not request coordinates before the passenger agrees to the disclosure', async () => {
    consent.dialog.mockResolvedValue(false);
    await expect(requestPickupPosition(controller())).resolves.toBe('unavailable');
    expect(vk.send).not.toHaveBeenCalled();
    expect(browserPosition).not.toHaveBeenCalled();
  });
});
