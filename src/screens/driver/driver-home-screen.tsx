import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { TaxiMap } from '@/components/map/taxi-map';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { AccessibleSwitch } from '@/components/ui/accessible-switch';
import { AppModal } from '@/components/ui/app-modal';
import { AppIcon } from '@/components/ui/app-icon';
import { MoneyValue } from '@/components/ui/money-value';
import { DraggableSheet } from '@/components/ui/sheet-drag-handle';
import { StatusChip } from '@/components/ui/status-chip';
import { formatNavigationDistance } from '@/domain/navigation';
import type { Coordinates } from '@/domain/models';
import {
  formatRoutePointCount,
  formatMultiStopRouteAddresses,
  routeDestinationTitle,
} from '@/domain/route-label';
import {
  driverRoutePointState,
  driverRouteTarget,
  driverTransitionLabel,
  rideStatusLabel,
} from '@/domain/ride-state';
import { useDriverLocation } from '@/hooks/use-driver-location';
import { useDriverNavigation } from '@/hooks/use-driver-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { syncDriverBackgroundLocation } from '@/location/driver-background-location';
import { ensureForegroundLocationPermission } from '@/location/foreground-location-permission';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { openYandexNavigatorRoute } from '@/utils/open-yandex-navigator';

function DriverOrderCard({
  demo,
  remainingDistanceMeters,
  remainingDurationSeconds,
  navigationLoading,
  navigationOrigin,
}: {
  demo: boolean;
  remainingDistanceMeters?: number;
  remainingDurationSeconds?: number;
  navigationLoading: boolean;
  navigationOrigin?: Coordinates | null;
}) {
  const [navigatorBusy, setNavigatorBusy] = useState(false);
  const [navigatorMessage, setNavigatorMessage] = useState<string | null>(null);
  const [releaseConfirmVisible, setReleaseConfirmVisible] = useState(false);
  const [releaseOrderId, setReleaseOrderId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [completionConfirmVisible, setCompletionConfirmVisible] = useState(false);
  const {
    driverRide: currentRide,
    nextDriverRide,
    driverOffer,
    createDriverOffer: createRide,
    transitionDriverRide: transitionRide,
    startWaiting,
    stopWaiting,
    releaseDriverRide,
    resetDriverRide: resetRide,
    refresh,
    rateDriverRide: rateRide,
    busy,
    error,
  } = useRide();

  if (!currentRide) {
    return (
      <View style={{ gap: spacing.x4 }}>
        <StatusChip label="Нет активного заказа" />
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Вы на линии</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Новый заказ появится здесь со звуковым и вибро-сигналом.
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>
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

  const rideDestinations = currentRide.destinations ?? [currentRide.destination];
  const routeAddresses = formatMultiStopRouteAddresses(
    currentRide.pickup,
    rideDestinations,
  );

  if (currentRide.status === 'searching') {
    return (
      <View style={{ gap: spacing.x4 }}>
        <StatusChip label="Новый заказ" tone="warning" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {currentRide.passenger?.name ?? 'Пассажир'}
          </Text>
          <RatingBadge
            rating={currentRide.passenger?.rating ?? 5}
            count={currentRide.passenger?.ratingCount}
            compact
          />
        </View>
        <View>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>ПОДАЧА</Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{routeAddresses.pickup}</Text>
        </View>
        <View style={{ gap: spacing.x2 }}>
          {routeAddresses.destinations.map((label, index) => (
            <View key={`${label}:${index}`}>
              <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
                {routeDestinationTitle(index, routeAddresses.destinations.length)}
              </Text>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {(currentRide.distanceMeters / 1_000).toFixed(1).replace('.', ',')} км · около{' '}
            {Math.max(1, Math.round(currentRide.durationSeconds / 60))} мин
          </Text>
          <MoneyValue valueMinor={currentRide.priceMinor} />
        </View>
        {!!currentRide.comment && (
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Комментарий: {currentRide.comment}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>
            {error}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
          <AppButton
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            style={{ flex: 1 }}
            onPress={resetRide}
          >
            Пропустить
          </AppButton>
          <AppButton
            fullWidth={false}
            loading={busy}
            disabled={busy}
            style={{ flex: 2 }}
            onPress={() => void transitionRide('accepted')}
          >
            Принять
          </AppButton>
        </View>
      </View>
    );
  }

  const nextStatus =
    currentRide.status === 'accepted'
      ? 'driver_arriving'
      : currentRide.status === 'driver_arriving'
        ? 'driver_waiting'
        : currentRide.status === 'driver_waiting'
          ? 'in_progress'
          : currentRide.status === 'in_progress'
            ? 'completed'
            : null;
  const routeTarget = driverRouteTarget(currentRide.status);
  const routePointLabels = [routeAddresses.pickup, ...routeAddresses.destinations];
  const routeMetricLabel =
    remainingDistanceMeters != null
      ? `${formatNavigationDistance(remainingDistanceMeters)}${
          remainingDurationSeconds != null
            ? ` · ${Math.max(1, Math.round(remainingDurationSeconds / 60))} мин`
            : ''
        }`
      : navigationLoading
        ? 'Строим маршрут…'
        : `Всего ${formatNavigationDistance(currentRide.distanceMeters)} · ${Math.max(
            1,
            Math.round(currentRide.durationSeconds / 60),
          )} мин`;
  const navigatorTargets =
    routeTarget === 'pickup'
      ? [currentRide.passengerCoordinates ?? currentRide.pickup.coordinates]
      : rideDestinations.map((destination) => destination.coordinates);
  const passengerPhone = currentRide.passenger?.phone;
  const paymentLabel =
    currentRide.paymentMethod === 'direct'
      ? 'Расчёт напрямую с пассажиром'
      : currentRide.paymentMethod === 'transfer'
      ? 'Перевод водителю'
      : 'Оплата наличными';

  const openNavigator = async () => {
    setNavigatorBusy(true);
    setNavigatorMessage(null);

    try {
      const result = await openYandexNavigatorRoute(
        navigatorTargets,
        navigationOrigin ?? currentRide.driver?.coordinates,
      );
      if (result === 'store') {
        setNavigatorMessage(
          'Яндекс Навигатор не установлен — открыли страницу установки.',
        );
      } else if (result === 'maps') {
        setNavigatorMessage('Маршрут открыт в Яндекс Картах.');
      }
    } catch {
      setNavigatorMessage(
        'Не удалось открыть Яндекс Навигатор. Проверьте настройки устройства.',
      );
    } finally {
      setNavigatorBusy(false);
    }
  };

  const requestCurrentRideRelease = () => {
    setReleaseOrderId(currentRide.id);
    setReleaseReason('');
    setReleaseConfirmVisible(true);
  };

  return (
    <View style={{ gap: spacing.x3 }}>
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
          tone={currentRide.status === 'completed' ? 'success' : 'info'}
        />
        <MoneyValue valueMinor={currentRide.priceMinor} compact />
      </View>
      <View
        style={{
          gap: spacing.x2,
          padding: spacing.x3,
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
            {routeTarget === 'pickup'
              ? 'СЛЕДУЮЩАЯ ТОЧКА · ПОДАЧА'
              : routeTarget === 'destination'
                ? rideDestinations.length > 1
                  ? `ПО МАРШРУТУ · ${formatRoutePointCount(rideDestinations.length)}`
                  : 'СЛЕДУЮЩАЯ ТОЧКА · ФИНИШ'
                : 'МАРШРУТ'}
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{
              ...typography.caption,
              color: colors.inkSecondary,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}
          >
            {routeMetricLabel}
          </Text>
        </View>
        <View style={{ gap: spacing.x1 }}>
          {routePointLabels.map((label, index) => {
            const pointState = driverRoutePointState(currentRide.status, index);
            const current = pointState === 'current';
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
      </View>
      {currentRide.status === 'completed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {paymentLabel}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.canvas,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name="profile" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x2 }}>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
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
      {!['completed', 'cancelled'].includes(currentRide.status) &&
        (!!passengerPhone || currentRide.passenger || routeTarget) && (
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
            {routeTarget && (
              <AppButton
                variant="secondary"
                compact
                fullWidth={false}
                loading={navigatorBusy}
                accessibilityLabel={
                  routeTarget === 'pickup'
                    ? 'Открыть маршрут к пассажиру в Яндекс Навигаторе'
                    : 'Открыть маршрут до места назначения в Яндекс Навигаторе'
                }
                icon={<AppIcon name="location" size={20} color={colors.ink} />}
                style={{ flex: 1, minWidth: 0 }}
                onPress={() => void openNavigator()}
              >
                Маршрут
              </AppButton>
            )}
          </View>
        )}
      {!!navigatorMessage && (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ ...typography.caption, color: colors.inkSecondary }}
        >
          {navigatorMessage}
        </Text>
      )}
      {nextDriverRide ? (
        <View
          style={{
            gap: spacing.x3,
            padding: spacing.x4,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x2 }}>
            <StatusChip label="Следующий заказ принят" tone="warning" />
            <MoneyValue valueMinor={nextDriverRide.priceMinor} compact />
          </View>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {nextDriverRide.pickup.label}
          </Text>
          <Text selectable numberOfLines={4} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {formatMultiStopRouteAddresses(
              nextDriverRide.pickup,
              nextDriverRide.destinations ?? [nextDriverRide.destination],
            ).destinations.map((label, index, labels) =>
              `${routeDestinationTitle(index, labels.length)}: ${label}`,
            ).join('\n')}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.infoText }}>
            После завершения текущей поездки этот заказ автоматически станет текущим.
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
            gap: spacing.x3,
            padding: spacing.x4,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x2 }}>
            <StatusChip label="Можно взять следующим" tone="warning" />
            <MoneyValue valueMinor={driverOffer.priceMinor} compact />
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
              onPress={resetRide}
            >
              Пропустить
            </AppButton>
            <AppButton
              compact
              fullWidth={false}
              loading={busy}
              style={{ flex: 1.5 }}
              onPress={() => void transitionRide('accepted')}
            >
              Взять следующим
            </AppButton>
          </View>
        </View>
      ) : demo && !['completed', 'cancelled'].includes(currentRide.status) ? (
        <AppButton variant="secondary" compact loading={busy} onPress={() => void createRide()}>
          Создать следующий демо-заказ
        </AppButton>
      ) : null}
      <WaitingBreakdown ride={currentRide} compact />
      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
      {currentRide.status === 'completed' ? (
        <RideRatingCard
          participantRole="passenger"
          participantName={currentRide.passenger?.name ?? 'Пассажир'}
          participantRating={currentRide.passenger?.rating ?? 5}
          participantRatingCount={currentRide.passenger?.ratingCount}
          submittedScore={currentRide.ratings?.byDriver}
          loading={busy}
          onSubmit={rateRide}
          onContinue={() => {
            resetRide();
            void refresh();
          }}
        />
      ) : currentRide.status === 'driver_waiting' ? (
        <View style={{ gap: spacing.x2 }}>
          <AppButton
            variant={currentRide.waitingStartedAt ? 'danger' : 'secondary'}
            compact
            loading={busy}
            onPress={() =>
              void (currentRide.waitingStartedAt ? stopWaiting() : startWaiting())
            }
          >
            {currentRide.waitingStartedAt
              ? 'Завершить ожидание'
              : 'Начать ожидание'}
          </AppButton>
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
              compact
              fullWidth={false}
              loading={busy}
              disabled={busy}
              style={{ flex: 2, minWidth: 0 }}
              onPress={() => void transitionRide('in_progress')}
            >
              Начать поездку
            </AppButton>
          </View>
        </View>
      ) : currentRide.status === 'in_progress' ? (
        <>
          <AppButton
            compact
            loading={busy}
            disabled={busy}
            onPress={() => setCompletionConfirmVisible(true)}
          >
            Завершить поездку
          </AppButton>
          <AppModal
            visible={completionConfirmVisible}
            title="Оплата получена?"
            description={`Подтвердите получение ${paymentLabel.toLowerCase()} на сумму ${formatMoney(currentRide.priceMinor)}. После этого поездка будет завершена.`}
            onClose={() => setCompletionConfirmVisible(false)}
          >
            <AppButton
              loading={busy}
              onPress={() => {
                void transitionRide('completed').then((completed) => {
                  if (completed) setCompletionConfirmVisible(false);
                });
              }}
            >
              Оплата получена, завершить
            </AppButton>
            <AppButton
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setCompletionConfirmVisible(false);
                router.push('/driver/support');
              }}
            >
              Есть проблема с оплатой
            </AppButton>
          </AppModal>
        </>
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
            compact
            fullWidth={false}
            loading={busy}
            disabled={busy}
            style={{ flex: 2, minWidth: 0 }}
            onPress={() => void transitionRide(nextStatus)}
          >
            {driverTransitionLabel[currentRide.status] ?? 'Продолжить'}
          </AppButton>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
          <AppButton
            variant="secondary"
            style={{ flexGrow: 1, flexBasis: 150 }}
            onPress={() => {
              resetRide();
              void refresh();
            }}
          >
            К новым заказам
          </AppButton>
          <AppButton
            style={{ flexGrow: 1, flexBasis: 180 }}
            onPress={() => router.push('/driver/earnings')}
          >
            Расчёты с сервисом
          </AppButton>
        </View>
      )}
      <AppModal
        visible={releaseConfirmVisible}
        title={releaseOrderId === nextDriverRide?.id ? 'Отказаться от следующего заказа?' : 'Отказаться от заказа?'}
        description="Пассажиру сразу будет найден другой водитель. Вернуться к этому заказу уже не получится."
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
            minHeight: 88,
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
        <AppButton variant="secondary" disabled={busy} onPress={() => setReleaseConfirmVisible(false)}>
          Остаться на заказе
        </AppButton>
      </AppModal>
    </View>
  );
}

export function DriverHomeScreen() {
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [online, setOnline] = useState<boolean | null>(demo ? true : null);
  const statusRequestRef = useRef(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { isPhone } = useResponsiveLayout();
  const { driverRide: currentRide, refresh } = useRide();
  const navigationRequested = Boolean(
    currentRide && driverRouteTarget(currentRide.status),
  );
  const activeTrip = Boolean(
    currentRide &&
      !['searching', 'completed', 'cancelled'].includes(currentRide.status),
  );
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

  const loadStatus = useCallback(async () => {
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
      const profile = await apiRequest<{ status: string }>('/v1/driver/profile', { token });
      if (statusRequestRef.current !== requestId) return;
      setOnline(profile.status === 'online' || profile.status === 'busy');
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
    if (!token || token.startsWith('demo:')) {
      setOnline(next);
      return;
    }
    try {
      if (next) {
        const permission = await ensureForegroundLocationPermission();
        if (!permission.granted) {
          setStatusError('Разрешите геолокацию — без неё нельзя выйти на линию');
          return;
        }
        await syncDriverBackgroundLocation(true);
      }
      setOnline(next);
      await apiRequest('/v1/driver/status', {
        method: 'POST',
        token,
        body: JSON.stringify({ status: next ? 'online' : 'offline' }),
      });
      if (next) await refresh();
      setStatusError(null);
    } catch (reason) {
      setOnline(!next);
      if (next) void syncDriverBackgroundLocation(false).catch(() => undefined);
      setStatusError(reason instanceof Error ? reason.message : 'Не удалось изменить статус');
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
      ? navigation.target
      : navigation.active
        ? null
        : currentRide?.destination;
  const activeRouteCoordinates =
    navigation.active ? navigation.coordinates : currentRide?.routeCoordinates;
  const visibleError = statusError ?? location.error ?? navigation.error;
  const panelContent = (
    <>
      {!activeTrip && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Смена</Text>
            <Text selectable style={{ ...typography.caption, color: online ? colors.success : colors.inkSecondary }}>
              {online === null ? 'Проверяем статус…' : online ? 'На линии' : 'Не на линии'}
            </Text>
          </View>
          <AccessibleSwitch
            value={online === true}
            disabled={online === null}
            accessibilityLabel={online ? 'Завершить смену' : 'Выйти на линию'}
            onValueChange={(next) => void changeOnline(next)}
            trackColor={{ true: colors.brand }}
          />
        </View>
      )}
      {!!visibleError && (
        <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>
          {visibleError}
        </Text>
      )}
      {online ? (
        <DriverOrderCard
          demo={demo}
          remainingDistanceMeters={navigation.summary?.distanceMeters}
          remainingDurationSeconds={navigation.summary?.durationSeconds}
          navigationLoading={navigation.loading}
          navigationOrigin={driverCoordinates}
        />
      ) : (
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Включите статус «На линии», чтобы получать новые заказы.
        </Text>
      )}
    </>
  );
  const panelContentStyle = {
    padding: activeTrip ? spacing.x3 : spacing.x5,
    gap: activeTrip ? spacing.x3 : spacing.x5,
    flexGrow: 1,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, flexDirection: isPhone ? 'column' : 'row' }}>
      <View
        style={{
          flex: 1,
          minHeight: isPhone ? (sheetExpanded ? 64 : activeTrip ? 72 : 260) : undefined,
          position: 'relative',
        }}
      >
        <TaxiMap
          pickup={mapPickup}
          destinations={currentRide?.destinations}
          destination={mapDestination}
          routeCoordinates={activeRouteCoordinates}
          routeTarget={navigation.targetKind}
          driver={driverCoordinates}
          driverHeading={location.heading}
          passenger={currentRide?.passengerCoordinates}
          followDriver={navigation.active || !currentRide}
          navigationMode={navigation.active}
        />
      </View>
      {isPhone ? (
        <DraggableSheet
          enabled
          expanded={sheetExpanded}
          onExpand={() => setSheetExpanded(true)}
          onCollapse={() => setSheetExpanded(false)}
          hint="Развернуть панель водителя"
          collapseHint="Свернуть панель водителя"
          style={{
            width: '100%',
            maxHeight: activeTrip
              ? sheetExpanded
                ? '92%'
                : '90%'
              : sheetExpanded
                ? '80%'
                : '62%',
            flexShrink: 1,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            borderCurve: 'continuous',
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!activeTrip}
            showsVerticalScrollIndicator={false}
            style={{ width: '100%', flexShrink: 1 }}
            contentContainerStyle={panelContentStyle}
          >
            {panelContent}
          </ScrollView>
        </DraggableSheet>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{
            width: 420,
            backgroundColor: colors.surface,
            borderLeftWidth: 1,
            borderColor: colors.border,
          }}
          contentContainerStyle={panelContentStyle}
        >
          {panelContent}
        </ScrollView>
      )}
    </View>
  );
}
