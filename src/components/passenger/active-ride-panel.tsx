import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { UserAvatar } from '@/components/user-avatar';
import { formatElapsedClock } from '@/domain/elapsed-time';
import type { RideOrder } from '@/domain/models';
import { rideStatusLabel } from '@/domain/ride-state';
import { motion, radius, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { VehiclePlate } from '@/components/vehicle/vehicle-plate';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  ride: RideOrder;
  pickupEtaMinutes?: number | null;
  onCancel: () => void;
  onReset: () => void;
  onRate: (score: number) => Promise<void>;
  busy?: boolean;
};

function SearchElapsedBadge({ startedAt }: { startedAt: string }) {
  const colors = useThemeColors();
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

function rideHeadline(ride: RideOrder, pickupEtaMinutes?: number | null): string {
  if (ride.status === 'searching') return 'Ищем свободного водителя';
  if (ride.driverQueuePosition === 2) return 'Водитель завершает предыдущий заказ';
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
  onCancel,
  onReset,
  onRate,
  busy = false,
}: Props) {
  const colors = useThemeColors();
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const terminal = ride.status === 'completed' || ride.status === 'cancelled';
  const cancellable = !terminal && ride.status !== 'in_progress';
  const driver = ride.driver;
  const showEta = pickupEtaMinutes != null && ride.driverQueuePosition !== 2 &&
    (ride.status === 'accepted' || ride.status === 'driver_arriving');
  const stage = ride.status === 'searching' ? 1 : ride.status === 'accepted' || ride.status === 'driver_arriving' ? 2 : ride.status === 'driver_waiting' ? 3 : 4;

  const openDetails = () => {
    router.push({ pathname: '/orders/[id]', params: { id: ride.id } });
  };

  return (
    <View style={{ gap: spacing.x4 }}>
      <Animated.View key={ride.status} entering={FadeIn.duration(motion.duration.standard).reduceMotion(ReduceMotion.System)}
        accessibilityLiveRegion="polite" style={{ gap: spacing.x2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x2 }}>
          <Text style={{ ...typography.caption, color: colors.inkSecondary, flex: 1 }}>
            {ride.driverQueuePosition === 2 ? 'Ваш заказ следующий' : rideStatusLabel[ride.status]}
          </Text>
          {ride.status === 'searching' && <SearchElapsedBadge startedAt={ride.createdAt} />}
        </View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, fontSize: showEta ? 42 : 28, lineHeight: showEta ? 52 : 36, color: colors.ink }}>
          {showEta ? `~ ${Math.max(1, pickupEtaMinutes)} ` : rideHeadline(ride, pickupEtaMinutes)}
          {showEta && <Text style={{ fontSize: 20, fontWeight: '400', color: colors.inkSecondary }}>мин</Text>}
        </Text>
        {!terminal && <>
          <View accessible accessibilityLabel={`Этап поездки ${stage} из 4`} style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
            {[1, 2, 3, 4].map((step) => <View key={step} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step <= stage ? colors.brand : colors.surfaceSecondary }} />)}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.micro, fontWeight: '400', color: colors.inkSecondary }}>{driver ? 'Машина найдена' : 'Подбираем машину'}</Text>
            <Text style={{ ...typography.micro, fontWeight: '400', color: colors.inkSecondary }}>{ride.status === 'in_progress' ? 'В пути' : 'Встречаемся'}</Text>
          </View>
        </>}
      </Animated.View>

      {ride.status === 'cancelled' && !!ride.cancellationReason && (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ ...typography.caption, color: colors.inkSecondary }}
        >
          {ride.cancellationReason}
        </Text>
      )}

      {ride.driverQueuePosition === 2 && (
        <Text selectable style={{ ...typography.body, color: colors.infoText }}>
          Водитель принял заказ заранее. Сообщим сразу, как он освободится и сможет выехать к вам.
        </Text>
      )}

      {driver && !terminal && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            paddingVertical: spacing.x3,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <UserAvatar name={driver.name} avatarUrl={driver.avatarUrl} size={42} tone="brand" />
          <View style={{ flex: 1, minWidth: 0, gap: spacing.x1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: spacing.x2,
              }}
            >
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                {driver.name}
              </Text>
            </View>
            <Text
              selectable
              numberOfLines={2}
              style={{ ...typography.caption, color: colors.inkSecondary }}
            >
              {driver.vehicle.color} {driver.vehicle.make} {driver.vehicle.model}
            </Text>
          </View>
          <RatingBadge rating={driver.rating} count={driver.ratingCount} compact />
        </View>
      )}

      {driver && !terminal && <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x3 }}>
        <VehiclePlate plate={driver.vehicle.plate} />
        <Text style={{ ...typography.micro, color: colors.inkSecondary }}>Ваш автомобиль</Text>
      </View>}

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

      {driver && !terminal && <AppButton variant="quiet" compact onPress={openDetails}
        accessibilityLabel="Открыть детали поездки" icon={<AppIcon name="orders" size={16} color={colors.inkSecondary} />}>
        {`Детали поездки · ${formatMoney(ride.priceMinor)}`}
      </AppButton>}

      <WaitingBreakdown ride={ride} compact />

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
        <AppButton onPress={onReset}>Новая поездка</AppButton>
      ) : driver ? (
        cancellable ? (
          <AppButton variant="quiet" onPress={() => setCancelConfirmVisible(true)}>
            Отменить поездку
          </AppButton>
        ) : null
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
          {cancellable && (
            <AppButton
              variant="secondary"
              onPress={() => setCancelConfirmVisible(true)}
              style={{ flex: 1 }}
            >
              Отменить
            </AppButton>
          )}
          <AppButton variant="quiet" onPress={openDetails} style={{ flex: 1 }}>
            Детали
          </AppButton>
        </View>
      )}

      <AppModal
        visible={cancelConfirmVisible}
        title="Отменить заказ?"
        description={
          ride.driverId
            ? 'Водитель уже назначен. Частые отмены могут временно ограничить создание новых заказов.'
            : 'Поиск водителя будет остановлен. Частые отмены могут временно ограничить создание новых заказов.'
        }
        onClose={() => setCancelConfirmVisible(false)}
      >
        <AppButton
          variant="danger"
          loading={busy}
          onPress={() => {
            setCancelConfirmVisible(false);
            onCancel();
          }}
        >
          Да, отменить заказ
        </AppButton>
        <AppButton
          variant="secondary"
          disabled={busy}
          onPress={() => setCancelConfirmVisible(false)}
        >
          Продолжить поездку
        </AppButton>
      </AppModal>
    </View>
  );
}
