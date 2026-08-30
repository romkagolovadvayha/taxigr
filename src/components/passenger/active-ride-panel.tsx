import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { MoneyValue } from '@/components/ui/money-value';
import { StatusChip } from '@/components/ui/status-chip';
import { VehicleIllustration } from '@/components/vehicle/vehicle-illustration';
import { formatElapsedClock } from '@/domain/elapsed-time';
import type { RideOrder } from '@/domain/models';
import { formatMultiStopRouteLabel } from '@/domain/route-label';
import { rideStatusLabel } from '@/domain/ride-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  ride: RideOrder;
  pickupEtaMinutes?: number | null;
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

function VehiclePlate({ plate }: { plate: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`Государственный номер ${plate}`}
      style={{
        alignSelf: 'flex-start',
        minHeight: 34,
        justifyContent: 'center',
        paddingHorizontal: spacing.x2,
        borderWidth: 1.5,
        borderColor: colors.vehiclePlateInk,
        borderRadius: radius.sm,
        backgroundColor: colors.vehiclePlateSurface,
      }}
    >
      <Text
        selectable
        style={{
          fontSize: 18,
          lineHeight: 22,
          fontWeight: '600',
          letterSpacing: 1.1,
          color: colors.vehiclePlateInk,
          fontVariant: ['tabular-nums'],
        }}
      >
        {plate.toLocaleUpperCase('ru-RU')}
      </Text>
    </View>
  );
}

export function ActiveRidePanel({
  ride,
  pickupEtaMinutes,
  onCancel,
  onReset,
  onRate,
  busy = false,
}: Props) {
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const terminal = ride.status === 'completed' || ride.status === 'cancelled';
  const cancellable = !terminal && ride.status !== 'in_progress';
  const driver = ride.driver;
  const showProminentHeadline =
    ride.status === 'accepted' ||
    ride.status === 'driver_arriving' ||
    ride.status === 'driver_waiting';

  const openDetails = () => {
    router.push({ pathname: '/orders/[id]', params: { id: ride.id } });
  };

  return (
    <View style={{ gap: spacing.x4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.x3,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: spacing.x2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.x2,
            }}
          >
            <StatusChip
              label={ride.driverQueuePosition === 2 ? 'Ваш заказ следующий' : rideStatusLabel[ride.status]}
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
          <Text
            accessibilityRole="header"
            selectable
            style={{
              ...(showProminentHeadline ? typography.pageTitle : typography.sectionTitle),
              color: colors.ink,
            }}
          >
            {rideHeadline(ride, pickupEtaMinutes)}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {formatMultiStopRouteLabel(ride.pickup, ride.destinations ?? [ride.destination])}
          </Text>
        </View>
        <MoneyValue valueMinor={ride.priceMinor} compact />
      </View>

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
            padding: spacing.x3,
            borderRadius: radius.lg,
            backgroundColor: colors.canvas,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: spacing.x2 }}>
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
              <RatingBadge rating={driver.rating} count={driver.ratingCount} compact />
            </View>
            <Text
              selectable
              numberOfLines={2}
              style={{ ...typography.caption, color: colors.inkSecondary }}
            >
              {driver.vehicle.color} {driver.vehicle.make} {driver.vehicle.model}
            </Text>
            <VehiclePlate plate={driver.vehicle.plate} />
          </View>
          <VehicleIllustration colorHex={driver.vehicle.colorHex} width={116} height={64} />
        </View>
      )}

      {driver && !terminal && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.x2 }}>
          {!!driver.phone && (
            <PhoneCallButton
              phone={driver.phone}
              label="Звонок"
              accessibilityLabel="Позвонить водителю"
              compact
              containerStyle={{ flex: 1 }}
            />
          )}
          <RideChatButton
            orderId={ride.id}
            label="Чат"
            accessibilityLabel="Написать водителю"
            compact
            style={{ flex: 1 }}
          />
          <AppButton
            variant="secondary"
            compact
            accessibilityLabel="Открыть детали поездки"
            icon={<AppIcon name="orders" size={20} color={colors.ink} />}
            onPress={openDetails}
            style={{ flex: 1 }}
          >
            Детали
          </AppButton>
        </View>
      )}

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
