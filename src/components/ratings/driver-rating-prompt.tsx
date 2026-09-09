import { ScrollView, Text } from 'react-native';

import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { AppModal } from '@/components/ui/app-modal';
import { useRide } from '@/state/ride-provider';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';

export function DriverRatingPrompt() {
  const colors = useThemeColors();
  const {
    driverRatingRide: ride,
    driverRatingBusy,
    driverRatingError,
    dismissDriverRating,
    rateDriverRide,
    busy,
  } = useRide();
  if (!ride) return null;
  const payment = ride.paymentMethod === 'direct'
    ? 'расчёт с пассажиром'
    : ride.paymentMethod === 'transfer' ? 'переводом' : 'наличными';

  return (
    <AppModal
      visible={!busy}
      title="Поездка завершена"
      description={`Получено ${formatMoney(ride.priceMinor)} · ${payment}`}
      onClose={dismissDriverRating}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.x3 }}>
        <RideRatingCard
          key={ride.id}
          participantRole="passenger"
          participantName={ride.passenger?.name ?? 'Пассажир'}
          participantRating={ride.passenger?.rating ?? 5}
          participantRatingCount={ride.passenger?.ratingCount}
          submittedScore={ride.ratings?.byDriver}
          loading={driverRatingBusy}
          onSubmit={rateDriverRide}
          onContinue={dismissDriverRating}
          continueLabel="К заказам"
        />
        {!!driverRatingError && (
          <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>
            {driverRatingError}
          </Text>
        )}
      </ScrollView>
    </AppModal>
  );
}
