import { isRidePricePending } from '@/domain/ride-price';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { TaxiMap } from '@/components/map/taxi-map';
import { ShiftSummary } from '@/components/driver/shift-summary';
import { DriverFareEditor } from '@/components/driver/driver-fare-editor';
import { DriverPreorders } from '@/components/driver/driver-preorders';
import { formatScheduledPickup } from '@/domain/scheduled-ride';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { YandexNavigationButton } from '@/components/ride/yandex-navigation-button';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { AccessibleSwitch } from '@/components/ui/accessible-switch';
import { AppModal } from '@/components/ui/app-modal';
import { MoneyValue } from '@/components/ui/money-value';
import { IconButton } from '@/components/ui/icon-button';
import { StatusChip } from '@/components/ui/status-chip';
import { formatNavigationDistance } from '@/domain/navigation';
import { driverNavigationAddress } from '@/domain/external-navigation';
import { headingBetweenCoordinates } from '@/domain/route-tracking';
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
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import { UserAvatar } from '@/components/user-avatar';

function DriverOrderCard({
  demo,
  remainingDistanceMeters,
  remainingDurationSeconds,
  navigationLoading,
}: {
  demo: boolean;
  remainingDistanceMeters?: number;
  remainingDurationSeconds?: number;
  navigationLoading: boolean;
}) {
  const colors = useThemeColors();
  const [releaseConfirmVisible, setReleaseConfirmVisible] = useState(false);
  const [releaseOrderId, setReleaseOrderId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [nextVisible, setNextVisible] = useState(false);
  const {
    driverRide: currentRide,
    nextDriverRide,
    driverOffer,
    createDriverOffer: createRide,
    transitionDriverRide: transitionRide,
    completeDriverStop,
    releaseDriverRide,
    resetDriverRide: resetRide,
    refresh,
    busy,
    error,
  } = useRide();

  if (!currentRide) {
    return (
      <View style={{ gap: spacing.x4 }}>
        <StatusChip label="Нет активного заказа" />
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Вы на линии</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Новый заказ появится здесь. Сообщим голосом и вибрацией.
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
      <View style={{ flex: 1, minHeight: 0, gap: spacing.x2 }}>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: spacing.x2 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusChip label="Новый заказ" tone="info" />
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>{currentRide.tariff === 'child' ? 'Детский' : 'Эконом'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <UserAvatar
            name={currentRide.passenger?.name ?? 'Пассажир'}
            avatarUrl={currentRide.passenger?.avatarUrl}
            size={40}
          />
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {currentRide.passenger?.name ?? 'Пассажир'}
          </Text>
          <RatingBadge
            rating={currentRide.passenger?.rating ?? 5}
            count={currentRide.passenger?.ratingCount}
            compact
          />
        </View>
        <View style={{ paddingVertical: spacing.x1, borderTopWidth: 1, borderColor: colors.border, gap: 2 }}>
          <Text selectable style={{ ...typography.micro, color: colors.inkSecondary }}>○  Подача</Text>
          <Text selectable style={{ ...typography.body, fontSize: 15, color: colors.ink }}>{routeAddresses.pickup}</Text>
        </View>
        <View style={{ gap: spacing.x2 }}>
          {routeAddresses.destinations.map((label, index) => (
            <View key={`${label}:${index}`} style={{ paddingBottom: spacing.x1, borderBottomWidth: 1, borderColor: colors.border, gap: 2 }}>
              <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
                {routeDestinationTitle(index, routeAddresses.destinations.length)}
              </Text>
              <Text selectable style={{ ...typography.body, fontSize: 15, color: colors.ink }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {currentRide.pricingMode === 'driver' ? 'Маршрут уточнит водитель' :
              `${(currentRide.distanceMeters / 1_000).toFixed(1).replace('.', ',')} км · около ${Math.max(1, Math.round(currentRide.durationSeconds / 60))} мин`}
          </Text>
          <MoneyValue pending={isRidePricePending(currentRide)} valueMinor={currentRide.priceMinor} />
        </View>
        {!!currentRide.comment && (
          <Text selectable numberOfLines={2} style={{ ...typography.caption, color: colors.inkSecondary }}>
            Комментарий: {currentRide.comment}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>
            {error}
          </Text>
        )}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
          <AppButton variant="quiet" compact fullWidth={false} style={{ flex: 1 }} disabled={busy} onPress={resetRide}>Пропустить</AppButton>
          <AppButton
            compact
            fullWidth={false}
            style={{ flex: 1.6 }}
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
    <View style={{ flex: 1, minHeight: 0, gap: spacing.x2 }}>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: spacing.x2 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        <MoneyValue pending={isRidePricePending(currentRide)} valueMinor={currentRide.priceMinor} compact />
      </View>
      {!!currentRide.scheduledAt && <Text selectable style={{ ...typography.caption, color: colors.danger }}>
        Подача {formatScheduledPickup(currentRide.scheduledAt)}
      </Text>}
      {currentRide.pricingMode === 'driver' && currentRide.driverQueuePosition !== 2 &&
        ['accepted', 'driver_arriving', 'driver_waiting', 'in_progress'].includes(currentRide.status) ?
        <DriverFareEditor key={currentRide.id} ride={currentRide}/> : null}
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
      </View>
      {routePointLabels.length > 2 && <AppButton variant="quiet" compact onPress={() => router.push({ pathname: '/driver/trips/[id]', params: { id: currentRide.id } })}>
        Все остановки · {routePointLabels.length}
      </AppButton>}
      {currentRide.status === 'completed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {paymentLabel}
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
            {navigationAddress && (
              <YandexNavigationButton key={`${currentRide.id}:${routeTarget}:${currentRide.nextDestinationIndex ?? 0}`}
                address={navigationAddress} pickup={routeTarget === 'pickup'} />
            )}
          </View>
        )}
      {(nextDriverRide || driverOffer) && <AppButton compact variant="secondary" onPress={() => setNextVisible(true)}>
        {nextDriverRide ? 'Следующий заказ принят' : 'Доступен следующий заказ'}
      </AppButton>}
      <AppModal visible={nextVisible && Boolean(nextDriverRide || driverOffer)} title="Следующий заказ" onClose={() => setNextVisible(false)}>
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
            <MoneyValue pending={isRidePricePending(nextDriverRide)} valueMinor={nextDriverRide.priceMinor} compact />
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
            gap: spacing.x3,
            padding: spacing.x4,
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
      {demo && !nextDriverRide && !driverOffer && !['completed', 'cancelled'].includes(currentRide.status) ? (
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
      </ScrollView>
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
        <AppButton
          compact
          loading={busy}
          disabled={busy || (!hasIntermediateStop && isRidePricePending(currentRide))}
          onPress={() => hasIntermediateStop ? void completeDriverStop() : void transitionRide('completed')}
        >
          {hasIntermediateStop ? `Остановка ${nextDestinationIndex + 1} пройдена` : isRidePricePending(currentRide) ? 'Сначала укажите стоимость выше' : 'Завершить поездку'}
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
  const colors = useThemeColors();
  const { token, user } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [online, setOnline] = useState<boolean | null>(demo ? true : null);
  const statusRequestRef = useRef(0);
  const statusChangeInFlight = useRef(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { isPhone, height } = useResponsiveLayout();
  const { driverRide: currentRide, refresh } = useRide();
  const navigationRequested = Boolean(
    currentRide && driverRouteTarget(currentRide.status),
  );
  const activeTrip = Boolean(
    currentRide &&
      !['searching', 'completed', 'cancelled'].includes(currentRide.status),
  );
  const handlingOrder = activeTrip || currentRide?.status === 'searching';
  const compactMap = isPhone && height < 740 && handlingOrder;
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
    if (statusChangeInFlight.current) return;
    if (!token || token.startsWith('demo:')) {
      setOnline(next);
      return;
    }
    statusChangeInFlight.current = true;
    statusRequestRef.current += 1;
    setChangingStatus(true);
    try {
      if (next) {
        const permission = await ensureForegroundLocationPermission('driver');
        if (!permission.granted) {
          setStatusError('Разрешите геолокацию — без неё нельзя выйти на линию');
          return;
        }
        await syncDriverBackgroundLocation(true);
      }
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
      if (next) void syncDriverBackgroundLocation(false).catch(() => undefined);
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
        />
      ) : (
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Включите статус «На линии», чтобы получать новые заказы.
        </Text>
      )}
    </>
  );
  const panelContentStyle = {
    padding: handlingOrder ? spacing.x3 : spacing.x5,
    gap: handlingOrder ? spacing.x2 : spacing.x5,
    flexGrow: 1,
  } as const;
  const map = <TaxiMap
    pickup={mapPickup}
    destinations={currentRide?.destinations?.slice(currentRide.nextDestinationIndex ?? 0)}
    destination={mapDestination}
    routeCoordinates={activeRouteCoordinates}
    routeTarget={navigation.targetKind}
    driver={mapDriverCoordinates}
    driverHeading={mapDriverHeading}
    passenger={currentRide?.passengerCoordinates}
    followDriver={navigation.active || !currentRide}
    navigationMode={navigation.active}
    trimCompletedRoute={navigation.active}
  />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingHorizontal: spacing.x3, paddingVertical: spacing.x2, backgroundColor: activeTrip ? colors.surface : colors.canvas,
        flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text accessibilityRole="header" numberOfLines={2} style={{ ...typography.bodyStrong, fontSize: 16, color: colors.ink }}>
            {activeTrip ? 'Текущая поездка' : isPhone ? 'Заказы' : `Хорошего дня, ${user?.name.split(' ')[0] || 'водитель'}`}
          </Text>
          {!activeTrip && <Text numberOfLines={1} style={{ ...typography.caption, fontSize: 11, color: colors.inkSecondary }}>
            {online === null ? 'Подключение…' : online ? 'На линии' : 'Не на линии'}
          </Text>}
        </View>
        {!activeTrip && <AccessibleSwitch value={online === true} disabled={online === null || changingStatus}
          accessibilityLabel={online ? 'Завершить смену' : 'Выйти на линию'} onValueChange={(next) => void changeOnline(next)} trackColor={{ true: colors.brand }} />}
        <DriverPreorders online={online === true} activeTrip={activeTrip} />
        {(!activeTrip || compactMap) && <IconButton icon={mapVisible ? 'close' : 'location'} size={44}
          label={mapVisible ? 'Скрыть карту заказа' : 'Показать карту заказа'} onPress={() => setMapVisible((value) => !value)} />}
      </View>
      <View style={{ flex: 1, minHeight: 0, flexDirection: isPhone ? 'column' : 'row' }}>
      {!compactMap && (activeTrip || mapVisible || !isPhone) && <View style={{ flex: activeTrip || !isPhone ? 1 : undefined, height: !activeTrip && isPhone ? 180 : undefined,
        minHeight: isPhone ? 120 : 0, overflow: 'hidden', backgroundColor: colors.mapFallback }}>
        {map}
      </View>}
      {handlingOrder ? <View style={{ ...panelContentStyle, flexGrow: isPhone ? 1 : 0, flex: isPhone && compactMap ? 1 : undefined, minHeight: 0,
        height: isPhone && !compactMap ? (activeTrip ? '74%' : undefined) : undefined,
        width: isPhone ? '100%' : 420, backgroundColor: colors.surface }}>
        {panelContent}
      </View> : <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        style={{ flexGrow: isPhone ? 1 : 0, flexShrink: 1, flexBasis: 'auto', width: isPhone ? '100%' : 420, backgroundColor: colors.surface }}>
        <ShiftSummary key={currentRide?.status === 'completed' ? currentRide.id : 'shift'} />
        <View style={panelContentStyle}>{panelContent}</View>
      </ScrollView>}
      </View>
      <AppModal visible={compactMap && mapVisible} title="Карта заказа" onClose={() => setMapVisible(false)}>
        <View style={{ height: Math.min(360, height * 0.56), overflow: 'hidden' }}>{map}</View>
      </AppModal>
    </View>
  );
}
