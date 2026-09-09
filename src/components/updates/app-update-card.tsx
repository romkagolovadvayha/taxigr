import { ActivityIndicator, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { storeNames } from '@/domain/app-updates';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { useAppUpdate } from '@/updates/app-update-provider';

export function AppUpdateCard() {
  const colors = useThemeColors();
  const { available, opening, error, controller } = useAppUpdate();
  if (!available) return null;

  return (
    <View style={{ gap: spacing.x2 }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`Обновить приложение до версии ${available.version} в ${storeNames[available.store]}`}
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        onPress={() => void controller.openStore()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3, padding: spacing.x4, minHeight: 80, borderRadius: radius.lg, backgroundColor: colors.brandSoft }}
      >
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon name="download" size={22} color={colors.brandInk} />
        </View>
        <View style={{ flex: 1, gap: spacing.x1 }}>
          <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Обновить приложение</Text>
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Версия {available.version} · {storeNames[available.store]}</Text>
        </View>
        {opening ? <ActivityIndicator color={colors.ink} /> : <AppIcon name="chevron" size={20} />}
      </AnimatedPressable>
      {!!error && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.dangerText }}>{error}</Text>}
    </View>
  );
}
