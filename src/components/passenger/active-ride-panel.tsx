import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { MoneyValue } from '@/components/ui/money-value';
import { StatusChip } from '@/components/ui/status-chip';
import { VehicleIllustration } from '@/components/vehicle/vehicle-illustration';
import type { RideOrder } from '@/domain/models';
import { rideStatusLabel } from '@/domain/ride-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  ride: RideOrder;
  onCancel: () => void;
  onReset: () => void;
  onRate: (score: number) => Promise<void>;
  busy?: boolean;
};

export function ActiveRidePanel({ ride, onCancel, onReset, onRate, busy = false }: Props) {
  const terminal = ride.status === 'completed' || ride.status === 'cancelled';
  const cancellable = !terminal && ride.status !== 'in_progress';
  const driver = ride.driver;

  return (
    <View style={{ gap: spacing.x4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.x3 }}>
        <View style={{ flex: 1, gap: spacing.x2 }}>
          <StatusChip
            label={rideStatusLabel[ride.status]}
            tone={
              ride.status === 'completed'
                ? 'success'
                : ride.status === 'cancelled'
                  ? 'danger'
                  : ride.status === 'searching'
                    ? 'warning'
                    : 'info'
            }
          />
          <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            {ride.status === 'searching'
              ? 'Есть машины рядом'
              : ride.status === 'cancelled'
                ? 'Поездка отменена'
                : ride.status === 'completed'
                  ? 'Спасибо за поездку'
                  : 'Водитель уже в пути'}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {ride.pickup.label} → {ride.destination.label}
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
