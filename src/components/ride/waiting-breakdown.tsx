import { Text, View } from 'react-native';

import { MoneyValue } from '@/components/ui/money-value';
import type { RideOrder } from '@/domain/models';
import {
  formatWaitingDuration,
  rideLivePriceMinor,
  rideWaitingPriceMinor,
  rideWaitingSeconds,
} from '@/domain/waiting';
import { radius, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { useThemeColors } from '@/theme/theme-provider';
import { useScreenClock } from '@/hooks/use-screen-clock';

export function WaitingBreakdown({
  ride,
  compact = false,
}: {
  ride: RideOrder;
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const active = Boolean(ride.waitingStartedAt);
  const now = useScreenClock(1_000, active);

  const seconds = rideWaitingSeconds(ride, now);
  const priceMinor = rideWaitingPriceMinor(ride, now);
  if (!active && seconds <= 0 && priceMinor <= 0) return null;

  return (
    <View
      style={{
        minHeight: compact ? 54 : 66,
        paddingHorizontal: spacing.x4,
        paddingVertical: spacing.x3,
        borderRadius: radius.md,
        backgroundColor: active ? colors.warningSoft : colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: active ? colors.warning : colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x3,
      }}
    >
      <View style={{ flex: 1, gap: spacing.x1 }}>
        <Text
          selectable
          style={{ ...typography.bodyStrong, color: colors.ink }}
        >
          {active ? 'Ожидание включено' : 'Ожидание'}
        </Text>
        <Text
          selectable
          style={{ ...typography.caption, color: colors.inkSecondary }}
        >
          {formatWaitingDuration(seconds)} · первые {ride.waitingFreeMinutes ?? 3} мин
          бесплатно, затем {(ride.waitingPerMinuteMinor ?? 400) / 100} ₽/мин
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.x1 }}>
        <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
          ДОПЛАТА
        </Text>
        <MoneyValue valueMinor={priceMinor} compact />
        <Text selectable style={{ ...typography.micro, color: colors.inkSecondary }}>
          Итого {formatMoney(rideLivePriceMinor(ride, now))}
        </Text>
      </View>
    </View>
  );
}
