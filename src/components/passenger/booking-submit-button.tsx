import { ActivityIndicator, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { formatMoney } from '@/utils/format';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import { useBookingAvailability } from '@/providers/booking-availability-provider';

type Props = {
  priceMinor: number;
  etaMinutes: number;
  disabled?: boolean;
  loading?: boolean;
  estimateAvailable: boolean;
  canRetry?: boolean;
  label?: string;
  loadingLabel?: string;
  accessibilityLabel?: string;
  onPress: () => void;
};

export function BookingSubmitButton({
  priceMinor,
  etaMinutes,
  disabled = false,
  loading = false,
  estimateAvailable,
  canRetry = false,
  label = 'Заказать такси',
  loadingLabel = 'Рассчитываем…',
  accessibilityLabel,
  onPress,
}: Props) {
  const colors = useThemeColors();
  const { enabled, checking, checkBooking } = useBookingAvailability();
  if (enabled !== true) {
    disabled = false;
    loading = false;
    estimateAvailable = false;
    canRetry = false;
    accessibilityLabel = label;
  }
  if (checking) { loading = true; loadingLabel = 'Проверяем доступность…'; }
  const unavailable = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (loading
          ? 'Рассчитываем стоимость и время подачи'
          : estimateAvailable
            ? `Перейти к подтверждению заказа за ${priceMinor / 100} рублей, подача около ${etaMinutes} минут`
            : canRetry
              ? 'Повторить расчёт стоимости поездки'
              : `${label}, укажите адреса отправления и назначения`)
      }
      aria-disabled={unavailable}
      aria-busy={loading}
      disabled={unavailable}
      onPress={() => { void checkBooking().then((allowed) => { if (allowed) onPress(); }); }}
      style={({ pressed }) => ({
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.x4,
        paddingVertical: spacing.x3,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: colors.brand,
        opacity: loading ? 0.78 : disabled ? 0.42 : pressed ? 0.88 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.x2,
          maxWidth: '100%',
        }}
      >
        {loading && <ActivityIndicator size="small" color={colors.brandInk} />}
        <Text style={{
          ...typography.bodyStrong,
          fontSize: 16,
          lineHeight: 22,
          textAlign: 'center',
          flexShrink: 1,
          color: colors.brandInk,
          fontVariant: ['tabular-nums'],
        }}>
          {loading
            ? loadingLabel
            : estimateAvailable
              ? `${label} · ${formatMoney(priceMinor)}`
              : canRetry ? 'Повторить расчёт' : label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
