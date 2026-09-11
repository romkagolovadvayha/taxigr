import * as Linking from 'expo-linking';

import nativeExternalAuth from '../../modules/taxigr-external-auth';

export class ExternalAuthWindowBlockedError extends Error {
  constructor() {
    super('The browser blocked the messenger authorization window.');
    this.name = 'ExternalAuthWindowBlockedError';
  }
}

export type PreparedExternalAuthWindow = Window | null;

type ExternalAuthChallenge =
  | { botUrl: string; appUrl?: string }
  | { authorizationUrl: string; appUrl?: string };

// Initial launch and "Open again" must use the same native link and fallback,
// and keep the original challenge token instead of starting another login.
export async function openExternalAuthChallenge(
  challenge: ExternalAuthChallenge,
  preparedWindow: PreparedExternalAuthWindow,
): Promise<void> {
  if ('authorizationUrl' in challenge) {
    if (process.env.EXPO_OS === 'android' && challenge.appUrl) {
      const opened = await nativeExternalAuth?.openVkMiniAppUrl?.(challenge.appUrl).catch(() => false);
      if (opened) return;
    }
    return openExternalAuthUrl(challenge.authorizationUrl, preparedWindow);
  }
  return openExternalAuthUrl(
    challenge.appUrl ?? challenge.botUrl,
    preparedWindow,
    challenge.appUrl ? challenge.botUrl : undefined,
  );
}

export function externalAuthOpenErrorMessage(error: unknown, provider: string): string {
  return error instanceof ExternalAuthWindowBlockedError
    ? 'Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.'
    : `Не удалось открыть ${provider}. Попробуйте ещё раз.`;
}

export function prepareExternalAuthWindow(): PreparedExternalAuthWindow {
  if (process.env.EXPO_OS !== 'web' || typeof window === 'undefined') return null;

  const externalWindow = window.open('about:blank', '_blank');
  if (externalWindow) {
    externalWindow.opener = null;
    externalWindow.document.title = 'Открываем мессенджер…';
  }
  return externalWindow;
}

export async function openExternalAuthUrl(
  url: string,
  preparedWindow: PreparedExternalAuthWindow,
  nativeFallbackUrl?: string,
): Promise<void> {
  if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined') {
    const externalWindow =
      preparedWindow && !preparedWindow.closed
        ? preparedWindow
        : window.open('about:blank', '_blank');
    if (!externalWindow) throw new ExternalAuthWindowBlockedError();

    externalWindow.opener = null;
    // Custom messenger schemes are unreliable in browsers. Prefer the HTTPS
    // fallback there, while native keeps trying the installed app first.
    externalWindow.location.replace(nativeFallbackUrl ?? url);
    externalWindow.focus();
    return;
  }

  if (process.env.EXPO_OS === 'android' && url.startsWith('https://max.ru/')) {
    // Older binaries / Expo Go do not include the optional native module.
    const opened = await nativeExternalAuth?.openMaxUrl(url).catch(() => false);
    if (opened) return;
  }

  try {
    await Linking.openURL(url);
  } catch (error) {
    if (!nativeFallbackUrl) throw error;
    await Linking.openURL(nativeFallbackUrl);
  }
}

export function closePreparedExternalAuthWindow(
  preparedWindow: PreparedExternalAuthWindow,
): void {
  if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
  if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined') window.focus();
}
