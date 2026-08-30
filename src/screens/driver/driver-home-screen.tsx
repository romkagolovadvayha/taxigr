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
import { formatRouteAddresses } from '@/domain/route-label';
import {
  driverRouteTarget,
  driverTransitionLabel,
  rideStatusLabel,
} from '@/domain/ride-state';
import { useDriverLocation } from '@/hooks/use-driver-location';
import { useDriverNavigation } from '@/hooks/use-driver-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useRide } from '@/state/ride-provider';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { openYandexNavigatorRoute } from '@/utils/open-yandex-navigator';

function DriverNavigationBanner({
  targetLabel,
  targetKind,
  distanceMeters,
  durationSeconds,
  loading,
}: {
  targetLabel: string;
  targetKind: 'pickup' | 'destination';
  distanceMeters?: number;
  durationSeconds?: number;
  loading: boolean;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        top: spacing.x3,
        left: spacing.x3,
        right: spacing.x3,
        padding: spacing.x4,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceRaised,
        ...shadows.floating,
        gap: spacing.x2,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.x3,
        }}
      >
        <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
          {targetKind === 'pickup' ? 'К ПАССАЖИРУ' : 'К МЕСТУ НАЗНАЧЕНИЯ'}
        </Text>
        <Text
          selectable
          style={{
            ...typography.bodyStrong,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {distanceMeters != null
            ? formatNavigationDistance(distanceMeters)
            : loading
              ? 'Строим маршрут…'
              : 'Маршрут'}
          {durationSeconds != null
            ? ` · ${Math.max(1, Math.round(durationSeconds / 60))} мин`
            : ''}
        </Text>
      </View>
      <Text
        selectable
        numberOfLines={2}
        style={{ ...typography.bodyStrong, color: colors.ink }}
      >
        {targetLabel}
      </Text>
    </View>
  );
}

function DriverOrderCard({ demo }: { demo: boolean }) {
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

  const routeAddresses = formatRouteAddresses(currentRide.pickup, currentRide.destination);

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
        <View>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>КУДА</Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{routeAddresses.destination}</Text>
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
  const nextAddress =
    routeTarget === 'pickup' ? currentRide.pickup : currentRide.destination;
  const navigatorTarget =
    routeTarget === 'pickup'
      ? currentRide.passengerCoordinates ?? currentRide.pickup.coordinates
      : currentRide.destination.coordinates;
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
      const result = await openYandexNavigatorRoute(navigatorTarget);
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

  return (
    <View style={{ gap: spacing.x4 }}>
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
      {routeTarget ? (
        <View style={{ gap: spacing.x1 }}>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
            {routeTarget === 'pickup' ? 'СЛЕДУЮЩАЯ ТОЧКА · ПОДАЧА' : 'СЛЕДУЮЩАЯ ТОЧКА · ФИНИШ'}
          </Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {nextAddress.label}
          </Text>
          {routeTarget === 'pickup' && currentRide.passengerCoordinates && (
            <Text selectable style={{ ...typography.caption, color: colors.infoText }}>
              Геопозиция пассажира отображается синей точкой на карте
            </Text>
          )}
        </View>
      ) : (
        <View>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
            МАРШРУТ
          </Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {routeAddresses.pickup}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            → {routeAddresses.destination}
          </Text>
        </View>
      )}
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
              width: 44,
              height: 44,
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
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              {paymentLabel}
            </Text>
            {!!passengerPhone && (
              <Text selectable style={{ ...typography.caption, color: colors.ink }}>
                {passengerPhone}
              </Text>
            )}
            {!!currentRide.comment && (
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {currentRide.comment}
              </Text>
            )}
          </View>
        </View>
      )}
      {!['completed', 'cancelled'].includes(currentRide.status) &&
        !!passengerPhone && (
          <PhoneCallButton phone={passengerPhone} label="Позвонить клиенту" />
        )}
      {!['completed', 'cancelled', 'searching'].includes(currentRide.status) &&
        currentRide.passenger && (
          <RideChatButton orderId={currentRide.id} label="Написать пассажиру" />
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
          <Text selectable numberOfLines={2} style={{ ...typography.caption, color: colors.inkSecondary }}>
            → {nextDriverRide.destination.label}
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
          <Text selectable numberOfLines={2} style={{ ...typography.caption, color: colors.inkSecondary }}>
            → {driverOffer.destination.label}
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
      {routeTarget && (
        <View style={{ gap: spacing.x2 }}>
          <AppButton
            variant="secondary"
            loading={navigatorBusy}
            accessibilityLabel={
              routeTarget === 'pickup'
                ? 'Открыть маршрут к пассажиру в Яндекс Навигаторе'
                : 'Открыть маршрут до места назначения в Яндекс Навигаторе'
            }
            onPress={() => void openNavigator()}
          >
            {routeTarget === 'pickup'
              ? 'Яндекс Навигатор · к пассажиру'
              : 'Яндекс Навигатор · до назначения'}
          </AppButton>
          {!!navigatorMessage && (
            <Text
              accessibilityRole="alert"
              selectable
              style={{ ...typography.caption, color: colors.inkSecondary }}
            >
              {navigatorMessage}
            </Text>
          )}
        </View>
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
        <View style={{ gap: spacing.x3 }}>
          <AppButton
            variant={currentRide.waitingStartedAt ? 'danger' : 'secondary'}
            loading={busy}
            onPress={() =>
              void (currentRide.waitingStartedAt ? stopWaiting() : startWaiting())
            }
          >
            {currentRide.waitingStartedAt
              ? 'Завершить ожидание'
              : 'Начать ожидание'}
          </AppButton>
          <AppButton
            loading={busy}
            disabled={busy}
            onPress={() => void transitionRide('in_progress')}
          >
            {currentRide.waitingStartedAt
              ? 'Начать поездку и завершить ожидание'
              : 'Начать поездку'}
          </AppButton>
        </View>
      ) : currentRide.status === 'in_progress' ? (
        <>
          <AppButton
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
        <AppButton
          loading={busy}
          disabled={busy}
          onPress={() => void transitionRide(nextStatus)}
        >
          {driverTransitionLabel[currentRide.status] ?? 'Продолжить'}
        </AppButton>
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
      {['accepted', 'driver_arriving', 'driver_waiting'].includes(currentRide.status) && (
        <>
          <AppButton
            variant="quiet"
            disabled={busy}
            onPress={() => {
              setReleaseOrderId(currentRide.id);
              setReleaseReason('');
              setReleaseConfirmVisible(true);
            }}
          >
            Не могу выполнить заказ
          </AppButton>
        </>
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
    setOnline(next);
    if (!token || token.startsWith('demo:')) return;
    try {
      await apiRequest('/v1/driver/status', {
        method: 'POST',
        token,
        body: JSON.stringify({ status: next ? 'online' : 'offline' }),
      });
      if (next) await refresh();
      setStatusError(null);
    } catch (reason) {
      setOnline(!next);
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
    navigation.coordinates.length >= 2
      ? navigation.coordinates
      : navigation.active && driverCoordinates && navigation.target
        ? [driverCoordinates, navigation.target.coordinates]
        : currentRide?.routeCoordinates;
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
        <DriverOrderCard demo={demo} />
      ) : (
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Включите статус «На линии», чтобы получать новые заказы.
        </Text>
      )}
    </>
  );
  const panelContentStyle = {
    padding: activeTrip ? spacing.x4 : spacing.x5,
    gap: activeTrip ? spacing.x4 : spacing.x5,
    flexGrow: 1,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, flexDirection: isPhone ? 'column' : 'row' }}>
      <View
        style={{
          flex: 1,
          minHeight: isPhone ? (sheetExpanded ? 140 : activeTrip ? 360 : 260) : undefined,
          position: 'relative',
        }}
      >
        <TaxiMap
          pickup={mapPickup}
          destination={mapDestination}
          routeCoordinates={activeRouteCoordinates}
          routeTarget={navigation.targetKind}
          driver={driverCoordinates}
          driverHeading={location.heading}
          passenger={currentRide?.passengerCoordinates}
          followDriver={navigation.active || !currentRide}
          navigationMode={navigation.active}
        />
        {navigation.active && navigation.target && navigation.targetKind && (
          <DriverNavigationBanner
            targetLabel={navigation.target.label}
            targetKind={navigation.targetKind}
            distanceMeters={navigation.summary?.distanceMeters}
            durationSeconds={navigation.summary?.durationSeconds}
            loading={navigation.loading}
          />
        )}
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
            maxHeight: sheetExpanded ? '80%' : activeTrip ? '48%' : '62%',
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
