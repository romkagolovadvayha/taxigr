import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { MoneyValue } from '@/components/ui/money-value';
import type { RideOrder } from '@/domain/models';
import {
  formatWaitingDuration,
  rideLivePriceMinor,
  rideWaitingPriceMinor,
  rideWaitingSeconds,
} from '@/domain/waiting';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';

export function WaitingBreakdown({
  ride,
  compact = false,
}: {
  ride: RideOrder;
  compact?: boolean;
}) {
  const [now, setNow] = useState(0);
  const active = Boolean(ride.waitingStartedAt);

  useEffect(() => {
    if (!active) return;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [active, ride.waitingStartedAt]);

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
