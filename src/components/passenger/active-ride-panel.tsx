import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { MoneyValue } from '@/components/ui/money-value';
import { StatusChip } from '@/components/ui/status-chip';
import { VehicleIllustration } from '@/components/vehicle/vehicle-illustration';
import { formatElapsedClock } from '@/domain/elapsed-time';
import type { RideOrder } from '@/domain/models';
import { formatRouteLabel } from '@/domain/route-label';
import { rideStatusLabel } from '@/domain/ride-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  ride: RideOrder;
  onCancel: () => void;
  onReset: () => void;
  onRate: (score: number) => Promise<void>;
  busy?: boolean;
};

function SearchElapsedBadge({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const elapsed = formatElapsedClock(startedAt, now);

  return (
    <View
      accessible
      accessibilityLabel={`Поиск водителя длится ${elapsed}`}
      style={{
        alignSelf: 'flex-start',
        minWidth: 64,
        paddingHorizontal: spacing.x3,
        paddingVertical: spacing.x2,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: colors.successSoft,
      }}
    >
      <Text
        style={{
          ...typography.caption,
          color: colors.successText,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          letterSpacing: 0.2,
        }}
      >
        {elapsed}
      </Text>
    </View>
  );
}

export function ActiveRidePanel({
  ride,
  onCancel,
  onReset,
  onRate,
  busy = false,
}: Props) {
  const terminal = ride.status === 'completed' || ride.status === 'cancelled';
  const cancellable = !terminal && ride.status !== 'in_progress';
  const driver = ride.driver;

  return (
    <View style={{ gap: spacing.x4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.x3 }}>
        <View style={{ flex: 1, gap: spacing.x2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x2 }}>
            <StatusChip
              label={rideStatusLabel[ride.status]}
              tone={
                ride.status === 'completed'
                  ? 'success'
                  : ride.status === 'cancelled'
                    ? 'danger'
                    : ride.status === 'searching'
                      ? 'success'
                      : 'info'
              }
            />
            {ride.status === 'searching' && <SearchElapsedBadge startedAt={ride.createdAt} />}
          </View>
          <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            {ride.status === 'searching'
              ? 'Ищем свободного водителя'
              : ride.status === 'cancelled'
                ? 'Поездка отменена'
                : ride.status === 'completed'
                  ? 'Спасибо за поездку'
                  : 'Водитель уже в пути'}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {formatRouteLabel(ride.pickup, ride.destination)}
          </Text>
        </View>
        <MoneyValue valueMinor={ride.priceMinor} compact />
      </View>

      <WaitingBreakdown ride={ride} compact />

      {driver && !terminal && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            padding: spacing.x3,
            borderRadius: radius.lg,
            backgroundColor: colors.canvas,
          }}
        >
          <VehicleIllustration
            colorHex={driver.vehicle.colorHex}
            width={64}
            height={36}
            framed
          />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
              {driver.vehicle.color} {driver.vehicle.make} {driver.vehicle.model}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x2 }}>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {driver.vehicle.plate} · {driver.name}
              </Text>
              <RatingBadge rating={driver.rating} count={driver.ratingCount} compact />
            </View>
          </View>
        </View>
      )}

      {driver && !terminal && !!driver.phone && (
        <PhoneCallButton phone={driver.phone} label="Позвонить водителю" />
      )}

      {ride.status === 'completed' && driver ? (
        <RideRatingCard
          participantRole="driver"
          participantName={driver.name}
          participantRating={driver.rating}
          participantRatingCount={driver.ratingCount}
          submittedScore={ride.ratings?.byPassenger}
          loading={busy}
          onSubmit={onRate}
          onContinue={onReset}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
          {terminal ? (
            <AppButton onPress={onReset}>Новая поездка</AppButton>
          ) : (
          <>
            {cancellable && (
              <AppButton variant="secondary" onPress={onCancel} style={{ flex: 1 }}>
                Отменить
              </AppButton>
            )}
            <AppButton
              variant="quiet"
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: ride.id } })}
              style={{ flex: 1 }}
            >
              Детали
            </AppButton>
          </>
          )}
        </View>
      )}
    </View>
  );
}
