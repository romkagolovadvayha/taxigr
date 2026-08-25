import * as Linking from 'expo-linking';

export class ExternalAuthWindowBlockedError extends Error {
  constructor() {
    super('The browser blocked the messenger authorization window.');
    this.name = 'ExternalAuthWindowBlockedError';
  }
}

export type PreparedExternalAuthWindow = Window | null;

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
