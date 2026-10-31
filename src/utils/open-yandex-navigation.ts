import * as Linking from 'expo-linking';

import { yandexNavigationUrls } from '../domain/external-navigation';
import type { Address } from '../domain/models';

function openWebMaps(url: string): void {
  // Run directly in the press handler so browsers retain the user gesture.
  const tab = window.open(url, '_blank');
  if (tab) tab.opener = null;
  else window.location.assign(url);
}

export async function openYandexMaps(address: Address): Promise<void> {
  const { maps } = yandexNavigationUrls(address);
  if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined') openWebMaps(maps);
  else await Linking.openURL(maps);
}

export async function openYandexNavigation(address: Address): Promise<'navigator' | 'maps'> {
  const urls = yandexNavigationUrls(address);
  if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined') {
    const userAgent = navigator.userAgent;
    if (/Android/i.test(userAgent)) {
      // Chrome's intent fallback also covers an absent Navigator. A visible Maps
      // button remains available when an embedded browser blocks app intents.
      try {
        window.location.assign(`intent:${urls.navigator.slice('yandexnavi:'.length)}#Intent;scheme=yandexnavi;package=ru.yandex.yandexnavi;S.browser_fallback_url=${encodeURIComponent(urls.maps)};end`);
        return 'navigator';
      } catch { openWebMaps(urls.maps); return 'maps'; }
    }
    if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)) {
      // Use the original tap, without a network request or timer. Automatic
      // delayed redirects can interrupt iOS's "Open Navigator" confirmation.
      try { window.location.assign(urls.navigator); return 'navigator'; }
      catch { openWebMaps(urls.maps); return 'maps'; }
    }
    openWebMaps(urls.maps);
    return 'maps';
  }
  try {
    // Android package-visibility rules can make canOpenURL return false even
    // with Navigator installed. Launch directly and handle an absent app.
    await Linking.openURL(urls.navigator);
    return 'navigator';
  } catch {
    await Linking.openURL(urls.maps);
    return 'maps';
  }
}
