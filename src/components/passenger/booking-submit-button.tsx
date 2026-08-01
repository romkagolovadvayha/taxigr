import { Pressable, Text, View } from 'react-native';

import { MoneyValue } from '@/components/ui/money-value';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  priceMinor: number;
  etaMinutes: number;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
};

export function BookingSubmitButton({
  priceMinor,
  etaMinutes,
  disabled = false,
  loading = false,
  onPress,
}: Props) {
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        loading
          ? 'Рассчитываем стоимость и время подачи'
          : `Перейти к подтверждению заказа за ${priceMinor / 100} рублей`
      }
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.x5,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        backgroundColor: colors.brand,
        opacity: loading ? 0.78 : disabled ? 0.42 : pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.x2 }}>
        {loading ? (
          <>
            <SkeletonBlock width={80} height={24} color={colors.brandInk} opacity={0.16} />
            <SkeletonBlock width={42} height={14} color={colors.brandInk} opacity={0.16} />
          </>
        ) : (
          <>
            <MoneyValue valueMinor={priceMinor} color={colors.brandInk} />
            <Text selectable style={{ ...typography.caption, color: colors.brandInkSecondary }}>
              ~{etaMinutes} мин
            </Text>
          </>
        )}
      </View>
      <Text style={{ ...typography.bodyStrong, color: colors.brandInk }}>Заказать</Text>
    </Pressable>
  );
}
