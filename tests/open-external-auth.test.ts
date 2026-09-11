import * as Linking from 'expo-linking';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nativeExternalAuth from '../modules/taxigr-external-auth';

import {
  ExternalAuthWindowBlockedError,
  externalAuthOpenErrorMessage,
  openExternalAuthChallenge,
  openExternalAuthUrl,
  prepareExternalAuthWindow,
} from '../src/utils/open-external-auth';

vi.mock('expo-linking', () => ({ openURL: vi.fn() }));
vi.mock('../modules/taxigr-external-auth', () => ({
  default: { openMaxUrl: vi.fn(), openVkMiniAppUrl: vi.fn() },
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('external messenger authorization window', () => {
  it('keeps the web app open and redirects a pre-opened tab', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const replace = vi.fn();
    const focus = vi.fn();
    const externalWindow = {
      opener: {} as unknown,
      closed: false,
      document: { title: '' },
      location: { replace },
      focus,
      close: vi.fn(),
    } as unknown as Window;
    const open = vi.fn().mockReturnValue(externalWindow);
    vi.stubGlobal('window', { open });

    const preparedWindow = prepareExternalAuthWindow();
    await openExternalAuthUrl('https://t.me/taxigr_bot?start=test', preparedWindow);

    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(externalWindow.opener).toBeNull();
    expect(replace).toHaveBeenCalledWith('https://t.me/taxigr_bot?start=test');
    expect(focus).toHaveBeenCalledOnce();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('reports when the browser blocks the new tab', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null) });

    await expect(openExternalAuthUrl('https://t.me/taxigr_bot', null)).rejects.toBeInstanceOf(
      ExternalAuthWindowBlockedError,
    );
  });

  it('closes the authorization tab and focuses the original web app', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const close = vi.fn();
    const focus = vi.fn();
    vi.stubGlobal('window', { focus });

    const { closePreparedExternalAuthWindow } = await import('../src/utils/open-external-auth');
    closePreparedExternalAuthWindow({ closed: false, close } as unknown as Window);

    expect(close).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('uses the HTTPS fallback instead of a custom Telegram scheme on web', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const replace = vi.fn();
    const externalWindow = {
      opener: null,
      closed: false,
      location: { replace },
      focus: vi.fn(),
    } as unknown as Window;
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(externalWindow) });

    await openExternalAuthUrl(
      'tg://resolve?domain=taxigr_bot&start=test',
      externalWindow,
      'https://t.me/taxigr_bot?start=test',
    );

    expect(replace).toHaveBeenCalledWith('https://t.me/taxigr_bot?start=test');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('uses Expo Linking in the native app', async () => {
    vi.stubEnv('EXPO_OS', 'android');

    await openExternalAuthUrl('https://t.me/taxigr_bot', null);

    expect(Linking.openURL).toHaveBeenCalledWith('https://t.me/taxigr_bot');
  });

  it('opens MAX directly on Android and preserves the bot challenge', async () => {
    vi.stubEnv('EXPO_OS', 'android');
    vi.mocked(nativeExternalAuth!.openMaxUrl).mockResolvedValue(true);
    const challenge = { botUrl: 'https://max.ru/taxigr_bot?start=one-time-token' };

    await openExternalAuthChallenge(challenge, null);
    await openExternalAuthChallenge(challenge, null);

    expect(nativeExternalAuth!.openMaxUrl).toHaveBeenCalledTimes(2);
    expect(nativeExternalAuth!.openMaxUrl).toHaveBeenNthCalledWith(1, challenge.botUrl);
    expect(nativeExternalAuth!.openMaxUrl).toHaveBeenNthCalledWith(2, challenge.botUrl);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it.each(['not-installed', 'native-error'])(
    'falls back to the same MAX web link for %s',
    async (failure) => {
      vi.stubEnv('EXPO_OS', 'android');
      if (failure === 'native-error') {
        vi.mocked(nativeExternalAuth!.openMaxUrl).mockRejectedValue(new Error('Unavailable'));
      } else {
        vi.mocked(nativeExternalAuth!.openMaxUrl).mockResolvedValue(false);
      }
      const botUrl = 'https://max.ru/taxigr_bot?start=original-token';

      await openExternalAuthChallenge({ botUrl }, null);

      expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(botUrl);
    },
  );

  it('keeps the MAX HTTPS universal link on iOS', async () => {
    vi.stubEnv('EXPO_OS', 'ios');
    const botUrl = 'https://max.ru/taxigr_bot?start=original-token';

    await openExternalAuthChallenge({ botUrl }, null);

    expect(nativeExternalAuth!.openMaxUrl).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(botUrl);
  });

  it('keeps MAX in the prepared web tab', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const replace = vi.fn();
    const externalWindow = {
      closed: false, location: { replace }, focus: vi.fn(),
    } as unknown as Window;
    vi.stubGlobal('window', { open: vi.fn() });
    const botUrl = 'https://max.ru/taxigr_bot?start=original-token';

    await openExternalAuthChallenge({ botUrl }, externalWindow);

    expect(replace).toHaveBeenCalledExactlyOnceWith(botUrl);
    expect(nativeExternalAuth!.openMaxUrl).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('preserves the direct Telegram link for initial launch and reopening', async () => {
    vi.stubEnv('EXPO_OS', 'android');
    const challenge = {
      appUrl: 'tg://resolve?domain=taxigr_bot&start=original-token',
      botUrl: 'https://t.me/taxigr_bot?start=original-token',
    };

    await openExternalAuthChallenge(challenge, null);
    await openExternalAuthChallenge(challenge, null);

    expect(Linking.openURL).toHaveBeenCalledTimes(2);
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, challenge.appUrl);
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, challenge.appUrl);
    expect(nativeExternalAuth!.openMaxUrl).not.toHaveBeenCalled();
  });

  it('retains the Telegram fallback when reopening without Telegram installed', async () => {
    vi.stubEnv('EXPO_OS', 'android');
    vi.mocked(Linking.openURL)
      .mockRejectedValueOnce(new Error('Telegram is not installed'))
      .mockResolvedValueOnce(true);
    const challenge = {
      appUrl: 'tg://resolve?domain=taxigr_bot&start=original-token',
      botUrl: 'https://t.me/taxigr_bot?start=original-token',
    };

    await openExternalAuthChallenge(challenge, null);

    expect(Linking.openURL).toHaveBeenNthCalledWith(1, challenge.appUrl);
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, challenge.botUrl);
  });

  it('preserves the configured VK OAuth flow and every query parameter', async () => {
    vi.stubEnv('EXPO_OS', 'android');
    const authorizationUrl = 'https://id.vk.ru/authorize?state=original-state&code_challenge=original-pkce&scope=phone';

    await openExternalAuthChallenge({ authorizationUrl }, null);

    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(authorizationUrl);
    expect(nativeExternalAuth!.openMaxUrl).not.toHaveBeenCalled();
  });

  it('opens the existing VK Mini App directly on Android for both launches', async () => {
    vi.stubEnv('EXPO_OS', 'android');
    vi.mocked(nativeExternalAuth!.openVkMiniAppUrl!).mockResolvedValue(true);
    const challenge = {
      appUrl: 'https://vk.com/app54638428#native_auth=original-state',
      authorizationUrl: 'https://id.vk.ru/authorize?state=original-state',
    };

    await openExternalAuthChallenge(challenge, null);
    await openExternalAuthChallenge(challenge, null);

    expect(nativeExternalAuth!.openVkMiniAppUrl).toHaveBeenCalledTimes(2);
    expect(nativeExternalAuth!.openVkMiniAppUrl).toHaveBeenNthCalledWith(1, challenge.appUrl);
    expect(nativeExternalAuth!.openVkMiniAppUrl).toHaveBeenNthCalledWith(2, challenge.appUrl);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it.each(['not-installed', 'native-error'])('uses the same VK OAuth fallback for %s', async (failure) => {
    vi.stubEnv('EXPO_OS', 'android');
    const openVk = vi.mocked(nativeExternalAuth!.openVkMiniAppUrl!);
    if (failure === 'native-error') openVk.mockRejectedValue(new Error('Unavailable'));
    else openVk.mockResolvedValue(false);
    const challenge = {
      appUrl: 'https://vk.com/app54638428#native_auth=original-state',
      authorizationUrl: 'https://id.vk.ru/authorize?state=original-state&code_challenge=original-pkce',
    };

    await openExternalAuthChallenge(challenge, null);

    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(challenge.authorizationUrl);
  });

  it('keeps VK OAuth in the prepared web tab even if a native URL is supplied', async () => {
    vi.stubEnv('EXPO_OS', 'web');
    const replace = vi.fn();
    const externalWindow = {
      closed: false, location: { replace }, focus: vi.fn(),
    } as unknown as Window;
    vi.stubGlobal('window', { open: vi.fn() });
    const challenge = {
      appUrl: 'https://vk.com/app54638428#native_auth=original-state',
      authorizationUrl: 'https://id.vk.ru/authorize?state=original-state',
    };

    await openExternalAuthChallenge(challenge, externalWindow);

    expect(replace).toHaveBeenCalledExactlyOnceWith(challenge.authorizationUrl);
    expect(nativeExternalAuth!.openVkMiniAppUrl).not.toHaveBeenCalled();
  });

  it('reports a native launch failure without blaming browser popup settings', async () => {
    vi.stubEnv('EXPO_OS', 'android');
    vi.mocked(nativeExternalAuth!.openMaxUrl).mockResolvedValue(false);
    const failure = new Error('No browser installed');
    vi.mocked(Linking.openURL).mockRejectedValue(failure);

    await expect(openExternalAuthChallenge({ botUrl: 'https://max.ru/test_bot' }, null))
      .rejects.toBe(failure);
    expect(externalAuthOpenErrorMessage(failure, 'MAX'))
      .toBe('Не удалось открыть MAX. Попробуйте ещё раз.');
    expect(externalAuthOpenErrorMessage(new ExternalAuthWindowBlockedError(), 'MAX'))
      .toContain('Браузер заблокировал');
  });

  it('falls back to the Telegram web link when the native app is unavailable', async () => {
    vi.stubEnv('EXPO_OS', 'ios');
    vi.mocked(Linking.openURL)
      .mockRejectedValueOnce(new Error('Telegram is not installed'))
      .mockResolvedValueOnce(true);

    await openExternalAuthUrl(
      'tg://resolve?domain=taxigr_bot&start=test',
      null,
      'https://t.me/taxigr_bot?start=test',
    );

    expect(Linking.openURL).toHaveBeenNthCalledWith(
      1,
      'tg://resolve?domain=taxigr_bot&start=test',
    );
    expect(Linking.openURL).toHaveBeenNthCalledWith(
      2,
      'https://t.me/taxigr_bot?start=test',
    );
  });
});
