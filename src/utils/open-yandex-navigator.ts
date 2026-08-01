import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import {
  buildYandexMapsRouteUrl,
  buildYandexNavigatorRouteUrl,
} from '@/domain/yandex-navigation';
import type { Coordinates } from '@/domain/models';

export type YandexNavigationOpenResult = 'navigator' | 'maps' | 'store';

const navigatorStoreUrl =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/ru/app/yandex-navigator/id474500851'
    : 'https://play.google.com/store/apps/details?id=ru.yandex.yandexnavi';

export async function openYandexNavigatorRoute(
  target: Coordinates,
): Promise<YandexNavigationOpenResult> {
  if (Platform.OS === 'web') {
    await Linking.openURL(buildYandexMapsRouteUrl(target));
    return 'maps';
  }

  try {
    await Linking.openURL(buildYandexNavigatorRouteUrl(target));
    return 'navigator';
  } catch {
    await Linking.openURL(navigatorStoreUrl);
    return 'store';
  }
}
