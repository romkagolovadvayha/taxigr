import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
const fetchTelegram = vi.hoisted(() => vi.fn());
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
  deleteItemAsync: async (key: string) => { storage.delete(key); },
}));
vi.mock('../server/config', () => ({config: {PUBLIC_URL: 'https://taxigr.ru', MAX_BOT_TOKEN: 'test-max', MAX_BOT_USERNAME: 'taxi_test_bot', TELEGRAM_BOT_TOKEN: 'test-telegram'}}));
vi.mock('../server/gateway-proxy', () => ({telegramDispatcher: async () => undefined}));

import { savePendingMessengerLogin, readPendingMessengerLogin, clearPendingMessengerLogin } from '../src/storage/messenger-login-storage';
import { parseMessengerReturn, nativeMessengerReturnUrl, resumeMessengerLogin } from '../src/auth/messenger-return';
import { messengerAuthReturnUrl } from '../server/messenger-auth-return';
import { sendMaxConfirmation } from '../server/max-bot';
import { vkCallbackHtml } from '../server/vk-auth';

vi.doMock(createRequire(new URL('../server/telegram-bot.ts', import.meta.url)).resolve('undici'), () => ({fetch: fetchTelegram}));
const { sendTelegramConfirmation } = await import('../server/telegram-bot');

const id = '123e4567-e89b-12d3-a456-426614174000';
const challenge = {challengeId: id, exchangeToken: 'device-only-exchange-secret', expiresInSeconds: 300};
beforeEach(() => { storage.clear(); vi.resetAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('returning from messenger verification', () => {
  it.each((['web', 'android'] as const).flatMap(platform => (['max', 'telegram', 'vk'] as const).map(provider => ({platform, provider}))))(
    'continues the same $provider login after reopening on $platform', async ({platform, provider}) => {
      vi.stubEnv('EXPO_OS', platform);
      vi.stubGlobal('window', {localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
      }});
      await savePendingMessengerLogin(provider, challenge);
      const url = new URL(messengerAuthReturnUrl(provider, id, platform));
      const target = parseMessengerReturn(url.searchParams.get('provider'), url.searchParams.get('challenge'))!;
      const verify = vi.fn().mockResolvedValue('verified');
      expect(await resumeMessengerLogin(target, verify)).toBe('verified');
      expect(verify).toHaveBeenCalledExactlyOnceWith({challengeId: id, exchangeToken: challenge.exchangeToken});
      expect(url.origin).toBe('https://taxigr.ru');
      expect(url.searchParams.get('target')).toBe(platform);
      expect(url.href).not.toContain(challenge.exchangeToken);
      expect(nativeMessengerReturnUrl(target)).not.toContain(challenge.exchangeToken);
    },
  );

  it('does not authenticate a forwarded link or a different pending login', async () => {
    const verify = vi.fn();
    expect(await resumeMessengerLogin({provider: 'max', challengeId: id}, verify)).toBe('missing');
    await savePendingMessengerLogin('telegram', challenge);
    expect(await resumeMessengerLogin({provider: 'max', challengeId: id}, verify)).toBe('missing');
    expect(await resumeMessengerLogin({provider: 'telegram', challengeId: id.replace(/0$/u, '1')}, verify)).toBe('missing');
    expect(verify).not.toHaveBeenCalled();
  });

  it('keeps the attempt on a network failure and allows an explicit retry', async () => {
    await savePendingMessengerLogin('max', challenge);
    const verify = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('verified');
    const input = {provider: 'max' as const, challengeId: id};
    await expect(resumeMessengerLogin(input, verify)).rejects.toThrow('offline');
    expect(await readPendingMessengerLogin()).not.toBeNull();
    expect(await resumeMessengerLogin(input, verify)).toBe('verified');
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('ignores expired and malformed attempts', async () => {
    await savePendingMessengerLogin('max', {...challenge, expiresInSeconds: -1});
    expect(await readPendingMessengerLogin()).toBeNull();
    storage.set('taxi_grahovo_pending_messenger_login', '{bad json');
    expect(await readPendingMessengerLogin()).toBeNull();
  });

  it('does not delete a newer attempt when an older response arrives', async () => {
    await savePendingMessengerLogin('max', challenge);
    await clearPendingMessengerLogin('older-attempt');
    expect(await readPendingMessengerLogin()).not.toBeNull();
    await clearPendingMessengerLogin(id);
    expect(await readPendingMessengerLogin()).toBeNull();
  });

  it('accepts only known providers, UUID attempts and fixed return targets', () => {
    expect(parseMessengerReturn('https://evil.example', id)).toBeNull();
    expect(parseMessengerReturn(['max'], id)).toBeNull();
    expect(parseMessengerReturn('max', 'javascript:alert(1)')).toBeNull();
    expect(messengerAuthReturnUrl('max', id, 'https://evil.example')).toBeUndefined();
  });

  it.each(['legacy', undefined, null])('does not offer unsupported return links to released clients: %s', platform => {
    for (const provider of ['max', 'telegram', 'vk'] as const) {
      expect(messengerAuthReturnUrl(provider, id, platform)).toBeUndefined();
    }
    expect(vkCallbackHtml(true)).toContain('https://taxigr.ru/return-to-taxi.html');
  });

  it.each(['max', 'telegram'] as const)('sends one return button after successful %s phone verification', async provider => {
    const fetchMock = provider === 'telegram' ? fetchTelegram : vi.fn();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ok: true, result: {}, message: {body: {mid: '1'}}}), {status: 200}));
    if (provider === 'max') vi.stubGlobal('fetch', fetchMock);
    const send = provider === 'max' ? sendMaxConfirmation : sendTelegramConfirmation;
    const returnUrl = messengerAuthReturnUrl(provider, id, 'android');
    await send('42', true, returnUrl);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.text).toBe('Номер успешно подтверждён');
    expect(JSON.stringify(body)).toContain('Заказать такси');
    expect(JSON.stringify(body)).toContain(returnUrl);
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockClear();
    await send('42', false, returnUrl);
    expect(fetchMock.mock.calls[0]![1].body).not.toContain(returnUrl);
    fetchMock.mockClear();
    await send('42', true, messengerAuthReturnUrl(provider, id, 'legacy'));
    expect(fetchMock.mock.calls[0]![1].body).not.toContain('/auth-return');
    expect(fetchMock.mock.calls[0]![1].body).toContain('Заказать такси');
    expect(fetchMock.mock.calls[0]![1].body).toContain('https://taxigr.ru/return-to-taxi.html');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).text).toBe('Номер успешно подтверждён');
  });

  it('includes a VK return link when a browser refuses to close the callback tab', () => {
    const url = messengerAuthReturnUrl('vk', id, 'web');
    const html = vkCallbackHtml(true, url);
    expect(html).toContain('Заказать такси</a>');
    expect(html).toContain(url.replace(/&/gu, '&amp;'));
    expect(vkCallbackHtml(false, url)).not.toContain('Заказать такси</a>');
  });

  it.each(['max', 'telegram'] as const)('opens the %s mini app after browser phone confirmation', async provider => {
    const fetchMock = provider === 'telegram' ? fetchTelegram : vi.fn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {}, message: { body: { mid: '1' } } })));
    if (provider === 'max') vi.stubGlobal('fetch', fetchMock);
    await (provider === 'max' ? sendMaxConfirmation : sendTelegramConfirmation)('42', true, messengerAuthReturnUrl(provider, id, 'web'));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.text).toBe('Номер успешно подтверждён');
    if (provider === 'max') expect(body.attachments[0].payload.buttons[0][0]).toMatchObject({ type: 'open_app', web_app: 'taxi_test_bot' });
    else expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://taxigr.ru/telegram');
    expect(JSON.stringify(body)).not.toContain('/auth-return');
  });
});
