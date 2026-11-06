import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultGatewaySettings } from '../src/domain/gateway';
import { closeGatewayDispatcher, gatewayDispatcher, telegramDispatcher } from '../server/gateway-proxy';
import { readGatewaySettings } from '../server/gateway-settings';

vi.mock('../server/gateway-settings', () => ({ readGatewaySettings: vi.fn() }));

const settings = { ...defaultGatewaySettings, proxyEnabled: true, proxyUsername: 'taxigr',
  proxyPassword: 'a:b/@ password', webhookSecret: '' };

afterEach(async () => { await closeGatewayDispatcher(); vi.clearAllMocks(); });

describe('database-managed Telegram proxy', () => {
  it('reuses connections and drains old connections on credential rotation or disabling', () => {
    const first = gatewayDispatcher(settings)!;
    const firstClose = vi.spyOn(first, 'close');
    expect(gatewayDispatcher({ ...settings })).toBe(first);
    const rotated = gatewayDispatcher({ ...settings, proxyPassword: 'rotated' });
    expect(rotated).not.toBe(first);
    expect(firstClose).toHaveBeenCalled();
    const rotatedClose = vi.spyOn(rotated!, 'close');
    expect(gatewayDispatcher({ ...settings, proxyEnabled: false })).toBeUndefined();
    expect(rotatedClose).toHaveBeenCalled();
  });

  it('reads fresh settings for each request and never bypasses a database error', async () => {
    vi.mocked(readGatewaySettings).mockResolvedValueOnce(settings)
      .mockResolvedValueOnce({ ...settings, proxyEnabled: false })
      .mockRejectedValueOnce(new Error('database unavailable'));
    expect(await telegramDispatcher()).toBeDefined();
    expect(await telegramDispatcher()).toBeUndefined();
    await expect(telegramDispatcher()).rejects.toThrow('database unavailable');
  });

  it('keeps the booking proxy separate from Telegram when either connection changes', () => {
    const telegram = gatewayDispatcher(settings)!;
    const telegramClose = vi.spyOn(telegram, 'close');
    const ai = { ...settings, proxyUrl: 'https://192.0.2.10', proxyUsername: 'booking' };
    const options = { scope: 'booking-ai' as const, servername: 'proxy.example.com' };
    const booking = gatewayDispatcher(ai, options)!;
    expect(booking).not.toBe(telegram);
    expect(gatewayDispatcher(ai, options)).toBe(booking);
    const bookingClose = vi.spyOn(booking, 'close');
    expect(gatewayDispatcher({ ...ai, proxyEnabled: false }, options)).toBeUndefined();
    expect(bookingClose).toHaveBeenCalled();
    expect(telegramClose).not.toHaveBeenCalled();
    expect(gatewayDispatcher(settings)).toBe(telegram);
  });
});
