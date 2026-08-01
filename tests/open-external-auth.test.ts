import * as Linking from 'expo-linking';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExternalAuthWindowBlockedError,
  openExternalAuthUrl,
  prepareExternalAuthWindow,
} from '../src/utils/open-external-auth';

vi.mock('expo-linking', () => ({ openURL: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
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
