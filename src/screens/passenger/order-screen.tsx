import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { useSession } from '@/auth/session-provider';
import { getDemoPassengerProgression } from '@/domain/demo-flow';
import {
  isDestinationAddressComplete,
  isPickupAddressComplete,
} from '@/domain/address-precision';
import { estimatePickupEtaMinutes } from '@/domain/pickup-eta';
import { TaxiMap } from '@/components/map/taxi-map';
import { ActiveRidePanel } from '@/components/passenger/active-ride-panel';
import { AddressFields } from '@/components/passenger/address-fields';
import { BookingSubmitButton } from '@/components/passenger/booking-submit-button';
import { TariffSelector } from '@/components/passenger/tariff-selector';
import { IconButton } from '@/components/ui/icon-button';
import { DraggableSheet } from '@/components/ui/sheet-drag-handle';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { usePassengerDriverTracking } from '@/hooks/use-passenger-driver-tracking';
import { useRide } from '@/state/ride-provider';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { formatEstimatedArrivalTime } from '@/utils/format';

function PassengerNav({ vertical = false }: { vertical?: boolean }) {
  return (
    <View
      style={{
        flexDirection: vertical ? 'column' : 'row',
        gap: spacing.x2,
        alignItems: 'center',
      }}
    >
      <IconButton icon="orders" label="Мои заказы" onPress={() => router.push('/orders')} />
      <IconButton icon="profile" label="Профиль" onPress={() => router.push('/profile')} />
    </View>
  );
}

function BookingPanel({ pickupEtaMinutes }: { pickupEtaMinutes?: number | null }) {
  const { locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
  const {
    pickup,
    destinations,
    destination,
    tariffs,
    selectedTariff,
    currentRide,
    setSelectedTariff,
    cancelRide,
    rateRide,
    resetRide,
    quoteStatus,
    requestQuote,
    busy,
    error,
  } = useRide();
  const selected = tariffs.find((item) => item.code === selectedTariff)!;
  const routeIsPrecise =
    isPickupAddressComplete(pickup) &&
    destinations.length > 0 &&
    destinations.every(isDestinationAddressComplete);
  const routeAddressesSelected = !!pickup && !!destination;
  const quotePending =
    routeIsPrecise && (quoteStatus === 'idle' || quoteStatus === 'loading');
  const quoteReady = routeIsPrecise && quoteStatus === 'ready';

  if (currentRide) {
    return (
      <View style={{ gap: spacing.x3 }}>
        {!!error && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
            {error}
          </Text>
        )}
        <ActiveRidePanel
          ride={currentRide}
          pickupEtaMinutes={pickupEtaMinutes}
          onCancel={cancelRide}
          onReset={resetRide}
          onRate={rateRide}
          busy={busy}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.x2 }}>
      <AddressFields
        pickup={pickup}
        destinations={destinations}
        destination={destination}
        onUseLocation={() => void selectCurrentLocation()}
        locationLoading={locationLoading}
        compact
        reducedActions
      />
      {routeAddressesSelected && (
        <TariffSelector
          tariffs={tariffs}
          selected={selectedTariff}
          onSelect={setSelectedTariff}
          compact
          loading={quotePending}
          estimateAvailable={quoteReady}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}
      <BookingSubmitButton
        priceMinor={selected.priceMinor}
        etaMinutes={selected.etaMinutes}
        disabled={!routeIsPrecise}
        loading={quotePending}
        estimateAvailable={quoteReady}
        canRetry={routeIsPrecise && quoteStatus === 'error'}
        onPress={() => {
          if (quoteReady) {
            router.push('/order-confirmation');
            return;
          }
          void requestQuote();
        }}
      />
    </View>
  );
}

export function OrderScreen() {
  const insets = useSafeAreaInsets();
  const { isPhone, isDesktop } = useResponsiveLayout();
  const [bookingPanelHeight, setBookingPanelHeight] = useState(0);
  const [arrivalClock, setArrivalClock] = useState(() => new Date());
  const {
    pickup,
    destinations,
    destination,
    routeCoordinates,
    routeSummary,
    tariffs,
    selectedTariff,
    quoteStatus,
    currentRide,
    transitionRide,
  } = useRide();
  const { token } = useSession();
  const demoSession = token?.startsWith('demo:') ?? false;
  const trackedDriver = usePassengerDriverTracking(currentRide, demoSession);
  const driverIsFinishingPreviousRide = currentRide?.driverQueuePosition === 2;
  const livePickupEtaMinutes = estimatePickupEtaMinutes({
    driver: driverIsFinishingPreviousRide ? null : trackedDriver.coordinates,
    pickup: currentRide?.pickup.coordinates,
    status: currentRide?.status,
  });
  const rideInProgress = currentRide?.status === 'in_progress';
  const routeCompleted = currentRide?.status === 'completed';
  const followDriver =
    !driverIsFinishingPreviousRide &&
    (currentRide?.status === 'driver_arriving' || rideInProgress);
  const selectedPreviewTariff = tariffs.find((tariff) => tariff.code === selectedTariff);
  const mapViewportInsets = useMemo(
    () =>
      isPhone
        ? {
            top: insets.top + 64,
            bottom: bookingPanelHeight,
          }
        : undefined,
    [bookingPanelHeight, insets.top, isPhone],
  );
  const expandSheet = useCallback(() => {
    if (currentRide) {
      router.push({ pathname: '/orders/[id]', params: { id: currentRide.id } });
      return;
    }
    router.push('/order-confirmation');
  }, [currentRide]);

  useEffect(() => {
    if (currentRide || !pickup || !destination || !routeSummary) return;
    const refreshTimer = setTimeout(() => setArrivalClock(new Date()), 0);
    const timer = setInterval(() => setArrivalClock(new Date()), 30_000);
    return () => {
      clearTimeout(refreshTimer);
      clearInterval(timer);
    };
  }, [currentRide, destination, pickup, routeSummary]);

  useEffect(() => {
    if (!token?.startsWith('demo:passenger') || !currentRide) return;
    const progression = getDemoPassengerProgression(currentRide.status);
    if (!progression) return;
    const timer = setTimeout(() => transitionRide(progression.next), progression.delay);
    return () => clearTimeout(timer);
  }, [currentRide, token, transitionRide]);

  const map = (
    <TaxiMap
      pickup={rideInProgress || routeCompleted ? null : currentRide?.pickup ?? pickup}
      destinations={currentRide?.destinations ?? destinations}
      destination={currentRide?.destination ?? destination}
      routeCoordinates={currentRide?.routeCoordinates ?? routeCoordinates}
      pickupEtaMinutes={
        currentRide
          ? livePickupEtaMinutes != null && livePickupEtaMinutes > 0
            ? livePickupEtaMinutes
            : undefined
          : pickup && destination && quoteStatus === 'ready' && routeSummary
            ? selectedPreviewTariff?.etaMinutes
            : undefined
      }
      destinationArrivalLabel={
        !currentRide &&
        pickup &&
        destination &&
        quoteStatus === 'ready' &&
        routeSummary &&
        selectedPreviewTariff
          ? `прибытие в ${formatEstimatedArrivalTime(
              arrivalClock,
              selectedPreviewTariff.etaMinutes,
              routeSummary.durationSeconds,
            )}`
          : undefined
      }
      driver={driverIsFinishingPreviousRide ? null : trackedDriver.coordinates}
      driverHeading={trackedDriver.heading}
      followDriver={followDriver}
      followZoom={rideInProgress ? 17 : 16}
      trimCompletedRoute={rideInProgress || routeCompleted}
      viewportInsets={mapViewportInsets}
    />
  );

  if (!isPhone) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.canvas }}>
        {isDesktop && (
          <View
            style={{
              width: 88,
              paddingTop: Math.max(insets.top, spacing.x4),
              paddingBottom: Math.max(insets.bottom, spacing.x4),
              alignItems: 'center',
              gap: spacing.x8,
              borderRightWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <BrandMark compact size={48} />
            <PassengerNav vertical />
          </View>
        )}
        <View
          style={{
            width: isDesktop ? 420 : 390,
            paddingTop: Math.max(insets.top, spacing.x6),
            paddingBottom: Math.max(insets.bottom, spacing.x6),
            paddingHorizontal: spacing.x5,
            gap: spacing.x6,
            backgroundColor: colors.surface,
            borderRightWidth: 1,
            borderColor: colors.border,
            zIndex: 2,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BrandMark size={44} />
            {!isDesktop && <PassengerNav />}
          </View>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Куда поедем?
          </Text>
          <View style={{ flex: 1 }}>
            <BookingPanel pickupEtaMinutes={livePickupEtaMinutes} />
          </View>
        </View>
        <View style={{ flex: 1 }}>{map}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ flex: 1 }}>{map}</View>
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.x3,
          left: spacing.x4,
          right: spacing.x4,
          pointerEvents: 'box-none',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            padding: spacing.x2,
            paddingRight: spacing.x3,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            ...shadows.subtle,
          }}
        >
          <BrandMark size={34} />
        </View>
        <PassengerNav />
      </View>
      <DraggableSheet
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          setBookingPanelHeight((currentHeight) =>
            Math.abs(currentHeight - nextHeight) >= 1 ? nextHeight : currentHeight,
          );
        }}
        enabled
        onExpand={expandSheet}
        hint={
          currentRide
            ? 'Развернуть детали активной поездки'
            : 'Развернуть подтверждение заказа'
        }
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          borderCurve: 'continuous',
          paddingHorizontal: spacing.x4,
          paddingBottom: Math.max(insets.bottom, spacing.x4),
          ...shadows.floating,
        }}
      >
        <BookingPanel pickupEtaMinutes={livePickupEtaMinutes} />
      </DraggableSheet>
    </View>
  );
}
