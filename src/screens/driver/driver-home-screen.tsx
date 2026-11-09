import { isRidePricePending } from '@/domain/ride-price';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { TaxiMap } from '@/components/map/taxi-map';
import { MapCredits } from '@/components/map/map-credits';
import { ShiftSummary } from '@/components/driver/shift-summary';
import { DriverFareEditor } from '@/components/driver/driver-fare-editor';
import { DriverRouteEditor } from '@/components/driver/driver-route-editor';
import { DriverPreorderOffer, DriverPreorders, type DriverPreorderView } from '@/components/driver/driver-preorders';
import { formatScheduledPickup } from '@/domain/scheduled-ride';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { YandexNavigationButton } from '@/components/ride/yandex-navigation-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { AccessibleSwitch } from '@/components/ui/accessible-switch';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { MoneyValue } from '@/components/ui/money-value';
import { IconButton } from '@/components/ui/icon-button';
import { StatusChip } from '@/components/ui/status-chip';
import { formatNavigationDistance } from '@/domain/navigation';
import { driverNavigationAddress } from '@/domain/external-navigation';
import { headingBetweenCoordinates } from '@/domain/route-tracking';
import { maxRideDestinations } from '@/domain/route-stops';
import {
  formatRoutePointCount,
  formatMultiStopRouteAddresses,
  routeDestinationTitle,
} from '@/domain/route-label';
import {
  driverRoutePointState,
  canControlRideWaiting,
  driverRouteTarget,
  driverTransitionLabel,
  rideStatusLabel,
} from '@/domain/ride-state';
import { useDriverLocation } from '@/hooks/use-driver-location';
import { useDriverNavigation } from '@/hooks/use-driver-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useRide } from '@/state/ride-provider';
import { componentSizing, radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import { UserAvatar } from '@/components/user-avatar';

function DriverOrderCard({
  demo,
  remainingDistanceMeters,
  remainingDurationSeconds,
  navigationLoading,
  hasPreorderOffer,
}: {
  demo: boolean;
  remainingDistanceMeters?: number;
  remainingDurationSeconds?: number;
  navigationLoading: boolean;
  hasPreorderOffer: boolean;
}) {
  const colors = useThemeColors();
  const { isPhone, height } = useResponsiveLayout();
  const compactTrip = isPhone && height < 650;
  const actionStyle = {
    minHeight: compactTrip ? componentSizing.booking.compactActionHeight : componentSizing.booking.actionHeight,
    paddingHorizontal: spacing.x3,
    borderRadius: radius.lg,
  };
  const [releaseConfirmVisible, setReleaseConfirmVisible] = useState(false);
  const [releaseOrderId, setReleaseOrderId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [nextVisible, setNextVisible] = useState(false);
  const [fareVisible, setFareVisible] = useState(false);
  const [routeEditorOrder, setRouteEditorOrder] = useState<string | null>(null);
  const {
    driverRide: currentRide,
    nextDriverRide,
    driverOffer,
    createDriverOffer: createRide,
    transitionDriverRide: transitionRide,
    completeDriverStop,
    addDriverRoutePoint,
    startWaiting,
    stopWaiting,
    releaseDriverRide,
    resetDriverRide: resetRide,
    refresh,
    busy,
    error,
  } = useRide();

  if (!currentRide) {
    return (
      <View style={{ gap: spacing.x2 }}>
        {!hasPreorderOffer && <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>Ждём новые заказы</Text>}
        {!!error && (
          <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
            {error}
          </Text>
        )}
        {demo && (
          <AppButton
            variant="secondary"
            loading={busy}
            onPress={() => void createRide()}
          >
            Создать демо-заказ
          </AppButton>
        )}
      </View>
    );
  }

  if (currentRide.status === 'cancelled' || currentRide.status === 'completed') {
    return <View testID="driver-ended-order" style={{ gap: spacing.x2 }}>
      <StatusChip label={currentRide.status === 'cancelled' ? 'Заказ отменён' : 'Поездка завершена'}
        tone={currentRide.status === 'cancelled' ? 'danger' : 'success'} />
      {!!currentRide.cancellationReason && <Text selectable numberOfLines={2}
        style={{ ...typography.caption, color: colors.inkSecondary }}>{currentRide.cancellationReason}</Text>}
      <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
        <AppButton compact fullWidth={false} style={{ flex: 1 }} onPress={() => { resetRide(); void refresh(); }}>
          К новым заказам
        </AppButton>
        <AppButton compact fullWidth={false} variant="quiet" style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/driver/trips/[id]', params: { id: currentRide.id } })}>Детали</AppButton>
      </View>
    </View>;
  }

  const rideDestinations = currentRide.destinations ?? [currentRide.destination];
  const routeAddresses = formatMultiStopRouteAddresses(
    currentRide.pickup,
    rideDestinations,
  );

  if (currentRide.status === 'searching') {
    return (
      <View testID="driver-order-offer" style={{ gap: compactTrip ? spacing.x1 : spacing.x2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusChip label="Новый заказ" tone="info" />
          {currentRide.tariff === 'child' && (
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Поездка с ребёнком</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <UserAvatar
            name={currentRide.passenger?.name ?? 'Пассажир'}
            avatarUrl={currentRide.passenger?.avatarUrl}
            size={compactTrip ? 28 : 40}
          />
          <Text selectable numberOfLines={1} style={{ ...typography.bodyStrong, flex: 1, color: colors.ink }}>
            {currentRide.passenger?.name ?? 'Пассажир'}
          </Text>
          <RatingBadge
            rating={currentRide.passenger?.rating ?? 5}
            count={currentRide.passenger?.ratingCount}
            compact
          />
        </View>
        <View style={{ padding: spacing.x2, gap: spacing.x1, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary }}>
          <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.ink }}>Подача · {routeAddresses.pickup}</Text>
          {routeAddresses.destinations.map((label, index) => (
            <Text key={`${label}:${index}`} selectable numberOfLines={1} style={{ ...typography.caption, color: colors.ink }}>
              {routeDestinationTitle(index, routeAddresses.destinations.length)} · {label}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {currentRide.pricingMode === 'driver' ? 'Маршрут уточнит водитель' :
              `${(currentRide.distanceMeters / 1_000).toFixed(1).replace('.', ',')} км · около ${Math.max(1, Math.round(currentRide.durationSeconds / 60))} мин`}
          </Text>
          <MoneyValue pending={isRidePricePending(currentRide)} valueMinor={currentRide.priceMinor} compact={compactTrip} />
        </View>
        {!!currentRide.comment && (
          <Text selectable numberOfLines={compactTrip ? 1 : 2} style={{ ...typography.caption, color: colors.inkSecondary }}>
            Комментарий: {currentRide.comment}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
            {error}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
          <AppButton variant="quiet" compact fullWidth={false} style={{ flex: 1 }} disabled={busy} onPress={resetRide}>Пропустить</AppButton>
          <AppButton
            fullWidth={false}
            style={{ ...actionStyle, flex: 1.6, minWidth: 0 }}
            loading={busy}
            disabled={busy}
            onPress={() => void transitionRide('accepted')}
          >
            Принять заказ
          </AppButton>
        </View>
      </View>
    );
  }

  const nextStatus =
    currentRide.status === 'accepted' || currentRide.status === 'driver_arriving'
      ? 'driver_waiting'
      : currentRide.status === 'driver_waiting'
        ? 'in_progress'
        : currentRide.status === 'in_progress'
          ? 'completed'
          : null;
  const routeTarget = driverRouteTarget(currentRide.status);
  const navigationAddress = driverNavigationAddress(currentRide);
  const nextDestinationIndex = currentRide.nextDestinationIndex ?? 0;
  const hasIntermediateStop = nextDestinationIndex < rideDestinations.length - 1;
  const canChangeRoute = Boolean(routeTarget) && currentRide.driverQueuePosition !== 2 && rideDestinations.length < maxRideDestinations;
  const canWait = canControlRideWaiting(currentRide.status) && currentRide.driverQueuePosition !== 2;
  const needsFareToFinish = currentRide.status === 'in_progress' && !hasIntermediateStop && isRidePricePending(currentRide);
  const canEditFare = currentRide.pricingMode === 'driver' && currentRide.driverQueuePosition !== 2 && nextStatus !== null;
  const canTakeNext = Boolean(nextDriverRide || driverOffer);
  const routePointLabels = [routeAddresses.pickup, ...routeAddresses.destinations];
  const routeMetricLabel =
    currentRide.pricingMode === 'driver' ? 'Уточните маршрут у пассажира' : remainingDistanceMeters != null
      ? `${formatNavigationDistance(remainingDistanceMeters)}${
          remainingDurationSeconds != null
            ? remainingDurationSeconds === 0 ? ' · на месте' : ` · ${Math.max(1, Math.round(remainingDurationSeconds / 60))} мин`
            : ''
        }`
      : navigationLoading
        ? 'Строим маршрут…'
        : `Всего ${formatNavigationDistance(currentRide.distanceMeters)} · ${Math.max(
            1,
            Math.round(currentRide.durationSeconds / 60),
          )} мин`;
  const passengerPhone = currentRide.passenger?.phone;
  const paymentLabel =
    currentRide.paymentMethod === 'direct'
      ? 'Расчёт напрямую с пассажиром'
      : currentRide.paymentMethod === 'transfer'
      ? 'Перевод водителю'
      : 'Оплата наличными';

  const requestCurrentRideRelease = () => {
    setReleaseOrderId(currentRide.id);
    setReleaseReason('');
    setReleaseConfirmVisible(true);
  };

  return (
    <View testID="driver-active-order" style={{ gap: compactTrip ? spacing.x1 : spacing.x2 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.x3,
        }}
      >
        <StatusChip
          label={rideStatusLabel[currentRide.status]}
          tone="info"
        />
        <MoneyValue pending={isRidePricePending(currentRide)} valueMinor={currentRide.priceMinor} compact />
      </View>
      {!!currentRide.scheduledAt && <Text selectable numberOfLines={compactTrip ? 1 : 2} style={{ ...typography.caption, color: colors.danger }}>
        Подача {formatScheduledPickup(currentRide.scheduledAt)}
      </Text>}
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Детали маршрута"
        onPress={() => router.push({ pathname: '/driver/trips/[id]', params: { id: currentRide.id } })}
        style={{
          gap: spacing.x1,
          padding: spacing.x2,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.x2,
          }}
        >
          <Text
            selectable
            numberOfLines={1}
            style={{ ...typography.micro, color: colors.inkMuted, flexShrink: 1 }}
          >
            {rideDestinations.length > 1 ? `Маршрут · ${formatRoutePointCount(rideDestinations.length)}` : 'Маршрут'}
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{
              ...typography.caption,
              color: colors.inkSecondary,
              flexShrink: 1,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}
          >
            {routeMetricLabel}
          </Text>
          <AppIcon name="chevron" size={16} color={colors.inkMuted} />
        </View>
        <View style={{ gap: spacing.x1 }}>
          {routePointLabels.map((label, index) => {
            const pointState = driverRoutePointState(currentRide.status, index, nextDestinationIndex);
            const current = pointState === 'current';
            if (routePointLabels.length > 2 && !current && index !== routePointLabels.length - 1) return null;
            const dotColor =
              pointState === 'completed'
                ? colors.success
                : current
                  ? colors.brand
                  : colors.inkMuted;
            const stateLabel =
              pointState === 'completed'
                ? 'пройдена'
                : current
                  ? 'текущая'
                  : 'впереди';

            return (
              <View
                key={`${label}:${index}`}
                accessible
                accessibilityLabel={`${
                  index === 0
                    ? 'Подача'
                    : routeDestinationTitle(index - 1, routeAddresses.destinations.length)
                }: ${label}, ${stateLabel}`}
                style={{
                  minHeight: 22,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.x2,
                }}
              >
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: radius.pill,
                    backgroundColor: dotColor,
                    borderWidth: pointState === 'pending' ? 1 : 0,
                    borderColor: pointState === 'pending' ? colors.borderStrong : colors.transparent,
                  }}
                />
                <Text
                  selectable
                  numberOfLines={1}
                  style={{
                    ...typography.caption,
                    flex: 1,
                    color: current ? colors.ink : colors.inkSecondary,
                    fontWeight: current ? '700' : '500',
                  }}
                >
                  {index === 0
                    ? 'Подача · '
                    : `${routeDestinationTitle(index - 1, routeAddresses.destinations.length)} · `}
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </AnimatedPressable>
      {compactTrip ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <Text selectable numberOfLines={1} style={{ ...typography.caption, flex: 1, color: colors.inkSecondary }}>
            {currentRide.passenger?.name ?? 'Пассажир'}
          </Text>
          <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {currentRide.paymentMethod === 'transfer' ? 'Переводом' : currentRide.paymentMethod === 'cash' ? 'Наличными' : 'Напрямую'}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <UserAvatar
            name={currentRide.passenger?.name ?? 'Пассажир'}
            avatarUrl={currentRide.passenger?.avatarUrl}
            size={40}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x2 }}>
              <Text selectable numberOfLines={1} style={{ ...typography.bodyStrong, flexShrink: 1, color: colors.ink }}>
                {currentRide.passenger?.name ?? 'Пассажир'}
              </Text>
              <RatingBadge
                rating={currentRide.passenger?.rating ?? 5}
                count={currentRide.passenger?.ratingCount}
                compact
              />
            </View>
            <Text
              selectable
              numberOfLines={1}
              style={{ ...typography.caption, color: colors.inkSecondary }}
            >
              {paymentLabel}
            </Text>
            {!!currentRide.comment && (
              <Text
                selectable
                numberOfLines={1}
                style={{ ...typography.caption, color: colors.inkSecondary }}
              >
                {currentRide.comment}
              </Text>
            )}
          </View>
        </View>
      )}
      {(!!passengerPhone || currentRide.passenger || routeTarget) && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.x2,
            }}
          >
            {!!passengerPhone && (
              <PhoneCallButton
                phone={passengerPhone}
                label="Звонок"
                accessibilityLabel="Позвонить пассажиру"
                compact
                fullWidth={false}
                containerStyle={{ flex: 1, minWidth: 0 }}
                buttonStyle={{ flex: 1, minWidth: 0 }}
              />
            )}
            {currentRide.passenger && (
              <RideChatButton
                orderId={currentRide.id}
                label="Чат"
                accessibilityLabel="Написать пассажиру"
                compact
                fullWidth={false}
                style={{ flex: 1, minWidth: 0 }}
              />
            )}
            {navigationAddress && (
              <YandexNavigationButton key={`${currentRide.id}:${routeTarget}:${currentRide.nextDestinationIndex ?? 0}`}
                address={navigationAddress} pickup={routeTarget === 'pickup'} />
            )}
          </View>
        )}
      {(canTakeNext || (canEditFare && !needsFareToFinish)) && <View style={{ flexDirection: 'row', gap: spacing.x1 }}>
        {canEditFare && !needsFareToFinish && <AppButton compact variant="secondary" fullWidth={false} style={{ flex: 1, minWidth: 0 }}
          onPress={() => setFareVisible(true)}>Стоимость</AppButton>}
        {canTakeNext && <AppButton compact variant="secondary" fullWidth={false} style={{ flex: 1, minWidth: 0 }}
          accessibilityLabel={nextDriverRide ? 'Следующий заказ принят' : 'Доступен следующий заказ'} onPress={() => setNextVisible(true)}>
          Следующий заказ
        </AppButton>}
      </View>}
      {canEditFare && <AppModal visible={fareVisible} title="Стоимость поездки" onClose={() => setFareVisible(false)}>
        <DriverFareEditor key={currentRide.id} ride={currentRide} onSaved={() => setFareVisible(false)} />
      </AppModal>}
      <AppModal compact={compactTrip} visible={nextVisible && Boolean(nextDriverRide || driverOffer)} title="Следующий заказ" onClose={() => setNextVisible(false)}>
      {nextDriverRide ? (
        <View
          style={{
            gap: spacing.x2,
            padding: spacing.x2,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x2 }}>
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>После текущей поездки</Text>
            <MoneyValue pending={isRidePricePending(nextDriverRide)} valueMinor={nextDriverRide.priceMinor} compact />
          </View>
          <Text selectable numberOfLines={2} style={{ ...typography.bodyStrong, color: colors.ink }}>
            {nextDriverRide.pickup.label}
          </Text>
          <Text selectable numberOfLines={3} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {formatMultiStopRouteAddresses(
              nextDriverRide.pickup,
              nextDriverRide.destinations ?? [nextDriverRide.destination],
            ).destinations.map((label, index, labels) =>
              `${routeDestinationTitle(index, labels.length)}: ${label}`,
            ).join('\n')}
          </Text>
          {nextDriverRide.passenger && (
            <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
              {!!nextDriverRide.passenger.phone && (
                <PhoneCallButton
                  phone={nextDriverRide.passenger.phone}
                  label="Позвонить"
                  compact
                  fullWidth={false}
                  containerStyle={{ flex: 1 }}
                  buttonStyle={{ flex: 1 }}
                />
              )}
              <RideChatButton
                orderId={nextDriverRide.id}
                label="Написать"
                compact
                fullWidth={false}
                style={{ flex: 1 }}
              />
            </View>
          )}
          <AppButton
            variant="quiet"
            compact
            disabled={busy}
            onPress={() => {
              setNextVisible(false);
              setReleaseOrderId(nextDriverRide.id);
              setReleaseReason('');
              setReleaseConfirmVisible(true);
            }}
          >
            Отказаться от следующего заказа
          </AppButton>
        </View>
      ) : driverOffer ? (
        <View
          style={{
            gap: spacing.x2,
            padding: spacing.x2,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x2 }}>
            <StatusChip label="Можно взять следующим" tone="warning" />
            <MoneyValue pending={isRidePricePending(driverOffer)} valueMinor={driverOffer.priceMinor} compact />
          </View>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {driverOffer.pickup.label}
          </Text>
          <Text selectable numberOfLines={4} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {formatMultiStopRouteAddresses(
              driverOffer.pickup,
              driverOffer.destinations ?? [driverOffer.destination],
            ).destinations.map((label, index, labels) =>
              `${routeDestinationTitle(index, labels.length)}: ${label}`,
            ).join('\n')}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
            <AppButton
              variant="secondary"
              compact
              fullWidth={false}
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => { resetRide(); setNextVisible(false); }}
            >
              Пропустить
            </AppButton>
            <AppButton
              compact
              fullWidth={false}
              loading={busy}
              style={{ flex: 1.5 }}
              onPress={() => { setNextVisible(false); void transitionRide('accepted'); }}
            >
              Взять следующим
            </AppButton>
          </View>
        </View>
      ) : null}
      </AppModal>
      {demo && !nextDriverRide && !driverOffer ? (
        <AppButton variant="secondary" compact loading={busy} onPress={() => void createRide()}>
          Создать следующий демо-заказ
        </AppButton>
      ) : null}
      {!!nextStatus && <WaitingBreakdown ride={currentRide} compact />}
      {(canWait || canChangeRoute) && <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
        {canWait && <AppButton compact fullWidth={false} variant="secondary" style={{ flex: 1, minHeight: 42, minWidth: 0 }}
          disabled={busy} accessibilityLabel={currentRide.waitingStartedAt ? 'Остановить ожидание' : 'Включить ожидание'}
          onPress={() => void (currentRide.waitingStartedAt ? stopWaiting() : startWaiting())}>
          {currentRide.waitingStartedAt ? 'Стоп ожидание' : 'Ожидание'}
        </AppButton>}
        {canChangeRoute && <AppButton compact fullWidth={false} variant="secondary" style={{ flex: 1, minHeight: 42, minWidth: 0 }}
          disabled={busy} onPress={() => setRouteEditorOrder(currentRide.id)}>Добавить точку</AppButton>}
      </View>}
      <DriverRouteEditor key={currentRide.id} visible={routeEditorOrder === currentRide.id}
        onClose={() => setRouteEditorOrder(null)} onSave={addDriverRoutePoint} busy={busy} />
      {!!error && (
        <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}
      {currentRide.status === 'driver_waiting' ? (
        <View style={{ gap: spacing.x2 }}>
          <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
            <AppButton
              variant="secondary"
              compact
              fullWidth={false}
              disabled={busy}
              style={{ flex: 1, minWidth: 0 }}
              onPress={requestCurrentRideRelease}
            >
              Отменить
            </AppButton>
            <AppButton
              fullWidth={false}
              loading={busy}
              disabled={busy}
              style={{ ...actionStyle, flex: 2, minWidth: 0 }}
              onPress={() => void transitionRide('in_progress')}
            >
              Начать поездку
            </AppButton>
          </View>
        </View>
      ) : currentRide.status === 'in_progress' ? (
        <AppButton
          style={actionStyle}
          loading={busy}
          disabled={busy}
          onPress={() => {
            if (needsFareToFinish) setFareVisible(true);
            else if (hasIntermediateStop) void completeDriverStop();
            else void transitionRide('completed');
          }}
        >
          {needsFareToFinish ? 'Указать стоимость' : hasIntermediateStop ? `Остановка ${nextDestinationIndex + 1} пройдена` : 'Завершить поездку'}
        </AppButton>
      ) : nextStatus ? (
        <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
          <AppButton
            variant="secondary"
            compact
            fullWidth={false}
            disabled={busy}
            style={{ flex: 1, minWidth: 0 }}
            onPress={requestCurrentRideRelease}
          >
            Отменить
          </AppButton>
          <AppButton
            fullWidth={false}
            loading={busy}
            disabled={busy}
            style={{ ...actionStyle, flex: 2, minWidth: 0 }}
            onPress={() => void transitionRide(nextStatus)}
          >
            {driverTransitionLabel[currentRide.status] ?? 'Продолжить'}
          </AppButton>
        </View>
      ) : null}
      <AppModal
        visible={releaseConfirmVisible}
        title={releaseOrderId === nextDriverRide?.id ? 'Отказаться от следующего заказа?' : 'Отказаться от заказа?'}
        description="Заказ снова станет доступен другим водителям."
        onClose={() => setReleaseConfirmVisible(false)}
      >
        <TextInput
          value={releaseReason}
          onChangeText={(value) => setReleaseReason(value.slice(0, 500))}
          placeholder="Кратко укажите причину"
          placeholderTextColor={colors.inkMuted}
          multiline
          maxLength={500}
          accessibilityLabel="Причина отказа от заказа"
          style={{
            ...typography.body,
            minHeight: 56,
            maxHeight: 92,
            padding: spacing.x3,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            color: colors.ink,
            backgroundColor: colors.surface,
            textAlignVertical: 'top',
          }}
        />
        <AppButton
          compact
          variant="danger"
          loading={busy}
          disabled={releaseReason.trim().length < 3}
          onPress={() => {
            void releaseDriverRide(releaseReason.trim(), releaseOrderId ?? undefined).then((released) => {
              if (released) setReleaseConfirmVisible(false);
            });
          }}
        >
          Отказаться и продолжить поиск
        </AppButton>
        <AppButton compact variant="secondary" disabled={busy} onPress={() => setReleaseConfirmVisible(false)}>
          Остаться на заказе
        </AppButton>
      </AppModal>
    </View>
  );
}

export function DriverHomeScreen() {
  const colors = useThemeColors();
  const { token, user } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [online, setOnline] = useState<boolean | null>(demo ? true : null);
  const [vehicleColorHex, setVehicleColorHex] = useState<string | null>(null);
  const statusRequestRef = useRef(0);
  const statusChangeInFlight = useRef(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [preorderView, setPreorderView] = useState<DriverPreorderView>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { isPhone, height } = useResponsiveLayout();
  const { driverRide: currentRide, driverPreorders, refresh } = useRide();
  const navigationRequested = Boolean(
    currentRide && driverRouteTarget(currentRide.status),
  );
  const activeTrip = Boolean(
    currentRide &&
      !['searching', 'completed', 'cancelled'].includes(currentRide.status),
  );
  const handlingOrder = Boolean(currentRide && currentRide.status !== 'draft');
  const preorderOffer = online && !activeTrip
    ? driverPreorders.filter(order => order.status === 'searching' && !order.driverId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : undefined;
  const compactMap = isPhone && height < 740;
  const location = useDriverLocation({
    enabled: online,
    navigationActive: navigationRequested,
    token,
    demoCoordinates: currentRide?.driver?.coordinates,
  });
  const driverCoordinates =
    location.coordinates ?? currentRide?.driver?.coordinates ?? null;
  const navigation = useDriverNavigation({
    ride: currentRide,
    origin: driverCoordinates,
    token,
  });
  const mapDriverCoordinates = demo && navigation.active
    ? navigation.coordinates[0] ?? null
    : driverCoordinates;
  const mapDriverHeading = demo && navigation.coordinates.length >= 2
    ? headingBetweenCoordinates(navigation.coordinates[0]!, navigation.coordinates[1]!)
    : location.heading;

  const loadStatus = useCallback(async () => {
    if (statusChangeInFlight.current) return;
    const requestId = ++statusRequestRef.current;
    if (demo) {
      setOnline(true);
      setStatusError(null);
      return;
    }
    if (!token) {
      setOnline(false);
      return;
    }
    try {
      const profile = await apiRequest<{ status: string; colorHex: string | null }>('/v1/driver/profile', { token });
      if (statusRequestRef.current !== requestId) return;
      setOnline(profile.status === 'online' || profile.status === 'busy');
      setVehicleColorHex(profile.colorHex);
      setStatusError(null);
    } catch (reason) {
      if (statusRequestRef.current !== requestId) return;
      setStatusError(reason instanceof Error ? reason.message : 'Не удалось загрузить статус водителя');
    }
  }, [demo, token]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus().catch(() => undefined);
      return () => {
        statusRequestRef.current += 1;
      };
    }, [loadStatus]),
  );

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && previousState !== 'active') {
        void loadStatus();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [loadStatus]);

  const changeOnline = async (next: boolean) => {
    if (statusChangeInFlight.current) return;
    if (!token || token.startsWith('demo:')) {
      setOnline(next);
      return;
    }
    statusChangeInFlight.current = true;
    statusRequestRef.current += 1;
    setChangingStatus(true);
    try {
      await apiRequest('/v1/driver/status', {
        method: 'POST',
        token,
        body: JSON.stringify({ status: next ? 'online' : 'offline' }),
      });
      setOnline(next);
      if (next) void refresh().catch(() => undefined);
      setStatusError(null);
    } catch (reason) {
      setOnline(!next);
      setStatusError(reason instanceof Error ? reason.message : 'Не удалось изменить статус');
    } finally {
      statusChangeInFlight.current = false;
      setChangingStatus(false);
    }
  };

  const mapPickup =
    navigation.targetKind === 'pickup'
      ? navigation.target
      : navigation.active
        ? null
        : currentRide?.pickup;
  const mapDestination =
    navigation.targetKind === 'destination'
      ? currentRide?.destination
      : navigation.active
        ? null
        : currentRide?.destination;
  const activeRouteCoordinates =
    navigation.active ? navigation.coordinates : currentRide?.routeCoordinates;
  const visibleError = statusError ?? navigation.error ?? (location.error ? 'Геолокация недоступна' : null);
  const panelContent = (
    <>
      {!!visibleError && (!handlingOrder || Boolean(statusError || navigation.error)) && (
        <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
          {visibleError}
        </Text>
      )}
      {preorderOffer && <DriverPreorderOffer order={preorderOffer} onOpen={() => setPreorderView(preorderOffer)} />}
      {online ? (
        <DriverOrderCard
          demo={demo}
          remainingDistanceMeters={navigation.summary?.distanceMeters}
          remainingDurationSeconds={navigation.summary?.durationSeconds}
          navigationLoading={navigation.loading}
          hasPreorderOffer={!!preorderOffer}
        />
      ) : (
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Включите статус «На линии», чтобы получать новые заказы.
        </Text>
      )}
    </>
  );
  const panelContentStyle = {
    paddingHorizontal: spacing.x4,
    paddingVertical: preorderOffer && handlingOrder && height < 600 ? spacing.x1 : spacing.x3,
    gap: preorderOffer ? spacing.x1 : handlingOrder ? spacing.x2 : spacing.x5,
  } as const;
  const map = <TaxiMap
    pickup={mapPickup}
    destinations={currentRide?.destinations?.slice(currentRide.nextDestinationIndex ?? 0)}
    destination={mapDestination}
    routeCoordinates={activeRouteCoordinates}
    routeTarget={navigation.targetKind}
    driver={mapDriverCoordinates}
    driverHeading={mapDriverHeading}
    driverColorHex={currentRide?.driver?.vehicle.colorHex ?? vehicleColorHex}
    passenger={currentRide?.passengerCoordinates}
    followDriver={navigation.active || !currentRide}
    navigationMode={navigation.active}
    trimCompletedRoute={navigation.active}
  />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingHorizontal: spacing.x4, paddingVertical: spacing.x2, backgroundColor: activeTrip ? colors.surface : colors.canvas,
        flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text accessibilityRole="header" numberOfLines={activeTrip ? 2 : 1} style={{ ...typography.bodyStrong, fontSize: 16, color: colors.ink }}>
            {activeTrip ? 'Текущая поездка' : isPhone ? 'Заказы' : `Хорошего дня, ${user?.name.split(' ')[0] || 'водитель'}`}
          </Text>
          {!activeTrip && <Text numberOfLines={1} style={{ ...typography.caption, fontSize: 11, color: colors.inkSecondary }}>
            {online === null ? 'Подключение…' : online ? 'На линии' : 'Не на линии'}
          </Text>}
        </View>
        {!activeTrip && <AccessibleSwitch value={online === true} disabled={online === null || changingStatus}
          accessibilityLabel={online ? 'Завершить смену' : 'Выйти на линию'} onValueChange={(next) => void changeOnline(next)} trackColor={{ true: colors.brand }} />}
        <DriverPreorders online={online === true} activeTrip={activeTrip} view={preorderView} onViewChange={setPreorderView} />
        {(!activeTrip || compactMap) && <IconButton icon={mapVisible ? 'close' : 'location'} size={44}
          label={mapVisible ? 'Скрыть карту заказа' : 'Показать карту заказа'} onPress={() => setMapVisible((value) => !value)} />}
      </View>
      <View testID="driver-ride-workspace" style={{ flex: 1, minHeight: 0, flexDirection: isPhone ? 'column' : 'row' }}>
        {!compactMap && (activeTrip || mapVisible || !isPhone) && <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: colors.mapFallback }}>
          {map}
          <MapCredits />
        </View>}
        <View style={{ flexShrink: 0, width: isPhone ? '100%' : 420, backgroundColor: colors.surface }}>
          {!handlingOrder && <ShiftSummary key={currentRide?.status === 'completed' ? currentRide.id : 'shift'} />}
          <View style={panelContentStyle}>{panelContent}</View>
        </View>
      </View>
      <AppModal visible={compactMap && mapVisible} title="Карта заказа" onClose={() => setMapVisible(false)}>
        <View style={{ height: Math.min(360, height * 0.56), overflow: 'hidden' }}>
          {map}
          <MapCredits />
        </View>
      </AppModal>
    </View>
  );
}
