import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Switch, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { TaxiMap } from '@/components/map/taxi-map';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { RideRatingCard } from '@/components/ratings/ride-rating-card';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { MoneyValue } from '@/components/ui/money-value';
import { DraggableSheet } from '@/components/ui/sheet-drag-handle';
import { StatusChip } from '@/components/ui/status-chip';
import { formatNavigationDistance } from '@/domain/navigation';
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
  const {
    currentRide,
    createRide,
    transitionRide,
    startWaiting,
    stopWaiting,
    resetRide,
    refresh,
    rateRide,
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
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{currentRide.pickup.label}</Text>
        </View>
        <View>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>КУДА</Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{currentRide.destination.label}</Text>
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

  const callPassenger = async () => {
    if (!passengerPhone) return;
    const phoneUrl = `tel:${passengerPhone.replace(/[^\d+]/gu, '')}`;
    try {
      const supported = await Linking.canOpenURL(phoneUrl);
      if (!supported) throw new Error('Phone calls are unavailable');
      await Linking.openURL(phoneUrl);
    } catch {
      setNavigatorMessage('Не удалось открыть приложение для звонка.');
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
            {currentRide.pickup.label}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            → {currentRide.destination.label}
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
      {currentRide.status !== 'completed' && !!passengerPhone && (
        <AppButton
          variant="secondary"
          accessibilityLabel={`Связаться с пассажиром по номеру ${passengerPhone}`}
          onPress={() => void callPassenger()}
        >
          Связаться с пассажиром
        </AppButton>
      )}
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
      ) : currentRide.status === 'in_progress' ? (
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
            loading={busy && !currentRide.waitingStartedAt}
            disabled={busy || Boolean(currentRide.waitingStartedAt)}
            onPress={() => void transitionRide('completed')}
          >
            {currentRide.waitingStartedAt
              ? 'Сначала завершите ожидание'
              : 'Завершить поездку'}
          </AppButton>
        </View>
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
    </View>
  );
}

export function DriverHomeScreen() {
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [online, setOnline] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { isPhone } = useResponsiveLayout();
  const { currentRide, refresh } = useRide();
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

  useEffect(() => {
    if (demo) {
      const timer = setTimeout(() => setOnline(true), 0);
      return () => clearTimeout(timer);
    }
    if (!token) {
      const timer = setTimeout(() => setOnline(false), 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    void apiRequest<{ status: string }>('/v1/driver/profile', {
      token,
      signal: controller.signal,
    })
      .then((profile) => {
        setOnline(profile.status === 'online' || profile.status === 'busy');
        setStatusError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setStatusError(reason instanceof Error ? reason.message : 'Не удалось загрузить статус водителя');
        }
      });
    return () => controller.abort();
  }, [demo, token]);

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
            <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Смена</Text>
            <Text selectable style={{ ...typography.caption, color: online ? colors.success : colors.inkSecondary }}>
              {online ? 'На линии' : 'Не на линии'}
            </Text>
          </View>
          <Switch
            value={online}
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
