import { ActivityIndicator, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { useThemeColors } from '@/theme/theme-provider';
import { typography } from '@/theme/tokens';
import type { MapViewportInsets } from './types';
import { MapPlaceholder } from './map-placeholder';

export function MapLoadingOverlay({ error, slow, mapVisible = false, onRetry, insets }: {
  error: string | null;
  slow: boolean;
  mapVisible?: boolean;
  onRetry: () => void;
  insets?: MapViewportInsets;
}) {
  const colors = useThemeColors();
  // Once the style exists, let the real map render progressively. Waiting for
  // every tile/font behind an opaque placeholder makes a usable map look frozen.
  if (mapVisible) return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: (insets?.top ?? 0) + 12,
      left: (insets?.left ?? 0) + 12, right: (insets?.right ?? 0) + 12, alignItems: 'center' }}>
      <View accessibilityRole={error ? 'alert' : 'progressbar'} accessibilityLiveRegion="polite"
        accessibilityLabel={error ?? 'Загружаем карту'}
        style={{ maxWidth: 320, padding: 12, borderRadius: 16, gap: 8, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!error && <ActivityIndicator size="small" color={colors.ink} />}
          <Text style={{ ...typography.caption, flexShrink: 1, color: colors.ink }}>
            {error ?? (slow ? 'Карта ещё загружается. Адрес можно ввести вручную.' : 'Загружаем карту…')}
          </Text>
        </View>
        {!!error && <AnimatedPressable accessibilityRole="button" onPress={onRetry}
          style={{ padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: colors.brand }}>
          <Text style={{ ...typography.bodyStrong, color: colors.brandInk }}>Повторить</Text>
        </AnimatedPressable>}
      </View>
    </View>
  );
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
    <MapPlaceholder />
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute', top: insets?.top ?? 0, bottom: insets?.bottom ?? 0,
        left: insets?.left ?? 0, right: insets?.right ?? 0,
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <View
        accessibilityRole={error ? 'alert' : 'progressbar'}
        accessibilityLabel={error ?? 'Загружаем карту'}
        accessibilityLiveRegion="polite"
        style={{ maxWidth: 300, padding: 18, borderRadius: 24, gap: 10, alignItems: 'center', backgroundColor: colors.surface }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon name="location" color={colors.brandInk} size={24} />
        </View>
        {!error && <Text style={{ ...typography.pageTitle, color: colors.ink }}>Грахово</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!error && <ActivityIndicator size="small" color={colors.ink} />}
          <Text style={{ ...typography.bodyStrong, color: colors.ink, textAlign: 'center' }}>
            {error ? 'Карта недоступна' : 'Загружаем карту…'}
          </Text>
        </View>
        {(slow || error) && (
          <Text style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
            {error ?? 'Нужно ещё немного времени. Адрес можно ввести вручную.'}
          </Text>
        )}
        {error && (
          <AnimatedPressable accessibilityRole="button" onPress={onRetry}
            style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.brand }}>
            <Text style={{ ...typography.bodyStrong, color: colors.brandInk }}>Повторить</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
    </View>
  );
}
