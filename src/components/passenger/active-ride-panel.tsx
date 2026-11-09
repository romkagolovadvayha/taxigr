import { ridePriceLabel } from '@/domain/ride-price';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { useRequestRideCancellation } from '@/components/passenger/passenger-ride-dialogs';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { formatScheduledPickup, isReservedRide } from '@/domain/scheduled-ride';
import { UserAvatar } from '@/components/user-avatar';
import { formatElapsedClock } from '@/domain/elapsed-time';
import type { RideOrder } from '@/domain/models';
import { motion, radius, spacing, typography } from '@/theme/tokens';
import { VehiclePlate } from '@/components/vehicle/vehicle-plate';
import { useThemeColors } from '@/theme/theme-provider';
import { useScreenClock } from '@/hooks/use-screen-clock';

type Props = {
  ride: RideOrder;
  pickupEtaMinutes?: number | null;
  onReset: () => void;
  onRate: (score: number) => Promise<void>;
  busy?: boolean;
  error?: string | null;
};

function SearchElapsedBadge({ startedAt }: { startedAt: string }) {
  const colors = useThemeColors();
  const now = useScreenClock(1_000);

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

function rideHeadline(ride: RideOrder, pickupEtaMinutes?: number | null): string {
  if (isReservedRide(ride)) return 'Предзаказ принят';
  if (ride.scheduledAt && ride.status === 'searching') return 'Предзаказ отправлен';
  if (ride.status === 'searching') return 'Ищем свободного водителя';
  if (ride.driverQueuePosition === 2) return 'Ваш заказ следующий';
  if (ride.status === 'driver_waiting') return 'Водитель приехал';
  if (ride.status === 'accepted' || ride.status === 'driver_arriving') {
    return pickupEtaMinutes != null
      ? `Через ~${Math.max(1, pickupEtaMinutes)} мин приедет`
      : 'Водитель едет к вам';
  }
  if (ride.status === 'in_progress') return 'Поездка идёт';
  if (ride.status === 'completed') return 'Спасибо за поездку';
  if (ride.cancellationCode === 'search_timeout') return 'Свободный водитель не найден';
  return 'Поездка отменена';
}

export function ActiveRidePanel({
  ride,
  pickupEtaMinutes,
  onReset,
  onRate,
  busy = false,
  error,
}: Props) {
  const colors = useThemeColors();
  const requestRideCancellation = useRequestRideCancellation();
  const terminal = ride.status === 'completed' || ride.status === 'cancelled';
  const cancellable = !terminal && ride.status !== 'in_progress';
  const driver = ride.driver;
  const showEta = pickupEtaMinutes != null && ride.driverQueuePosition !== 2 && !isReservedRide(ride) &&
    (ride.status === 'accepted' || ride.status === 'driver_arriving');

  const openDetails = () => {
    router.push({ pathname: '/orders/[id]', params: { id: ride.id } });
  };

  return (
    <View style={{ gap: spacing.x2 }}>
      <Animated.View key={ride.status} entering={FadeIn.duration(motion.duration.standard).reduceMotion(ReduceMotion.System)}
        accessibilityLiveRegion="polite" style={{ gap: spacing.x2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <Text accessibilityRole="header" selectable numberOfLines={2}
            style={{ ...typography.sectionTitle, flex: 1, fontSize: showEta ? 26 : 20, lineHeight: showEta ? 32 : 26, color: colors.ink }}>
            {showEta ? `Подача через ~${Math.max(1, pickupEtaMinutes)} мин` : rideHeadline(ride, pickupEtaMinutes)}
          </Text>
          {ride.status === 'searching' && !ride.scheduledAt && <SearchElapsedBadge startedAt={ride.createdAt} />}
        </View>
        {!terminal && !!ride.scheduledAt && <Text selectable testID="passenger-scheduled-time" numberOfLines={2} style={{ ...typography.bodyStrong, color: colors.danger }}>
          Подача {formatScheduledPickup(ride.scheduledAt)}
        </Text>}
      </Animated.View>

      {ride.status === 'cancelled' && !!ride.cancellationReason && (
        <Text
          accessibilityRole="alert"
          selectable
          numberOfLines={2}
          style={{ ...typography.caption, color: colors.inkSecondary }}
        >
          {ride.cancellationReason}
        </Text>
      )}

      {driver && !terminal && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            paddingVertical: spacing.x2,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <UserAvatar name={driver.name} avatarUrl={driver.avatarUrl} size={36} tone="brand" />
          <View style={{ flex: 1, minWidth: 0, gap: spacing.x1 }}>
            <Text selectable numberOfLines={1} style={{ ...typography.bodyStrong, color: colors.ink }}>{driver.name}</Text>
            <Text
              selectable
              numberOfLines={1}
              style={{ ...typography.caption, color: colors.inkSecondary }}
            >
              {driver.vehicle.color} {driver.vehicle.make} {driver.vehicle.model}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: spacing.x1 }}>
            <VehiclePlate plate={driver.vehicle.plate} />
            <RatingBadge rating={driver.rating} count={driver.ratingCount} compact />
          </View>
        </View>
      )}

      {driver && !terminal && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.x2 }}>
          {!!driver.phone && (
            <PhoneCallButton
              phone={driver.phone}
              label="Позвонить"
              variant="secondary"
              buttonStyle={{ backgroundColor: colors.brandSoft }}
              accessibilityLabel="Позвонить водителю"
              compact
              containerStyle={{ flex: 1 }}
            />
          )}
          <RideChatButton
            orderId={ride.id}
            label="Написать"
            accessibilityLabel="Написать водителю"
            compact
            style={{ flex: 1 }}
          />
        </View>
      )}

      {!terminal && <WaitingBreakdown ride={ride} compact />}

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
      ) : terminal ? (
        <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
          <AppButton compact fullWidth={false} style={{ flex: 1 }} onPress={onReset}>Новая поездка</AppButton>
          <AppButton compact fullWidth={false} variant="quiet" style={{ flex: 1 }} onPress={openDetails}>Детали</AppButton>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
          {cancellable && (
            <AppButton
              variant="secondary"
              compact
              fullWidth={false}
              loading={busy}
              onPress={() => requestRideCancellation(ride.id)}
              style={{ flex: 1 }}
            >
              Отменить
            </AppButton>
          )}
          <AppButton variant="quiet" compact fullWidth={false} onPress={openDetails} style={{ flex: 1 }}>
            {`Детали · ${ridePriceLabel(ride)}`}
          </AppButton>
        </View>
      )}

      {!!error && (
        <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}

    </View>
  );
}
