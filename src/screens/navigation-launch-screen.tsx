import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { YandexNavigationButton } from '@/components/ride/yandex-navigation-button';
import { parseNavigationPage } from '@/domain/external-navigation';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';

export function NavigationLaunchScreen() {
  const params = useLocalSearchParams<{ address?: string; lat?: string; lon?: string }>();
  const address = parseNavigationPage(params);
  const colors = useThemeColors();
  return <Screen contentStyle={{ maxWidth: 560, gap: spacing.x5 }}>
    <Text accessibilityRole="header" style={{ ...typography.pageTitle, color: colors.ink }}>Маршрут</Text>
    {address ? <>
      <Text style={{ ...typography.sectionTitle, color: colors.ink }}>{address.label}</Text>
      <Text style={{ ...typography.body, color: colors.inkSecondary }}>
        {address.coordinatePrecision === 'approximate'
          ? 'Точка адреса ещё не подтверждена. Найдите нужный дом в Навигаторе перед поездкой.'
          : 'Откройте маршрут от вашего текущего местоположения.'}
      </Text>
      <View style={{ maxWidth: 300 }}><YandexNavigationButton address={address} pickup={false} /></View>
      <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
        Если мессенджер не разрешает переход, откройте эту страницу во внешнем браузере через меню мессенджера.
      </Text>
    </> : <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.danger }}>
      В ссылке нет корректного адреса. Откройте маршрут из актуального сообщения о заказе.
    </Text>}
  </Screen>;
}
