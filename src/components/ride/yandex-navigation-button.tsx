import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import type { Address } from '@/domain/models';
import { spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import { openYandexMaps, openYandexNavigation } from '@/utils/open-yandex-navigation';

export function YandexNavigationButton({ address, pickup }: { address: Address; pickup: boolean }) {
  const colors = useThemeColors();
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (mapsOnly = false) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError(null);
    setAttempted(true);
    try {
      if (mapsOnly) await openYandexMaps(address);
      else await openYandexNavigation(address);
    } catch {
      setError('Не удалось открыть маршрут. Попробуйте Яндекс Карты.');
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return <View style={{ flex: 1, minWidth: 0, gap: spacing.x2 }}>
    <AppButton variant="secondary" compact fullWidth={false} loading={opening}
      accessibilityLabel={pickup ? 'Открыть маршрут к пассажиру в Яндекс Навигаторе' : 'Открыть маршрут к следующей точке в Яндекс Навигаторе'}
      accessibilityHint="Если Навигатор не установлен, откроются Яндекс Карты"
      icon={<AppIcon name="location" size={20} color={colors.ink} />}
      style={{ minWidth: 0 }} onPress={() => void open()}>
      Маршрут
    </AppButton>
    {attempted && !error && <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Если Навигатор не открылся:</Text>}
    {attempted && <AppButton variant="quiet" compact fullWidth={false} disabled={opening}
      accessibilityLabel="Открыть маршрут в Яндекс Картах" onPress={() => void open(true)}>
      Яндекс Карты
    </AppButton>}
    {error && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>{error}</Text>}
  </View>;
}
