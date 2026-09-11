import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
import { PassengerWorkspace } from '@/components/passenger/passenger-workspace';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { IconButton } from '@/components/ui/icon-button';
import { UserAvatar } from '@/components/user-avatar';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { usePassengerDriverTracking } from '@/hooks/use-passenger-driver-tracking';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { useFeedbackPreferences } from '@/preferences/feedback-preferences-provider';
import { useRide } from '@/state/ride-provider';
import { spacing, typography } from '@/theme/tokens';
import { formatEstimatedArrivalTime } from '@/utils/format';
import { useThemeColors } from '@/theme/theme-provider';

const mapInsets = { top: 44, bottom: 60, left: 28, right: 28 };

function BookingPanel({ pickupEtaMinutes, section = 'content', validationAttempt, onInvalidRoute }: {
  pickupEtaMinutes?: number | null;
  section?: 'content' | 'action';
  validationAttempt: number;
  onInvalidRoute: () => void;
}) {
  const colors = useThemeColors();
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
  const quotePending =
    routeIsPrecise && (quoteStatus === 'idle' || quoteStatus === 'loading');
  const quoteReady = routeIsPrecise && quoteStatus === 'ready';

  if (section === 'action') {
    if (currentRide) return null;
    return <BookingSubmitButton
      priceMinor={selected.priceMinor}
      etaMinutes={selected.etaMinutes}
      loading={quotePending}
      estimateAvailable={quoteReady}
      canRetry={routeIsPrecise && quoteStatus === 'error'}
      onPress={() => {
        if (!routeIsPrecise) { onInvalidRoute(); return; }
        if (quoteReady) { router.push('/order-confirmation'); return; }
        void requestQuote();
      }}
    />;
  }

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
    <View style={{ gap: spacing.x3 }}>
      <AddressFields
        pickup={pickup}
        destinations={destinations}
        destination={destination}
        validationAttempt={validationAttempt}
        compact
        hideAddDestination
      />
        <TariffSelector
          tariffs={tariffs}
          selected={selectedTariff}
          onSelect={setSelectedTariff}
          compact
          loading={quotePending}
          estimateAvailable={quoteReady}
        />
      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function OrderScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { isPhone, isDesktop } = useResponsiveLayout();
  const { vibrationEnabled } = useFeedbackPreferences();
  const [validationAttempt, setValidationAttempt] = useState(0);
  const bookingScrollRef = useRef<ScrollView>(null);
  const handleInvalidRoute = () => {
    setValidationAttempt((attempt) => attempt + 1);
    bookingScrollRef.current?.scrollTo({ y: 0, animated: false });
    if (vibrationEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
  };
  const { locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
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
  const { token, user } = useSession();
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
  const clock = useScreenClock(30_000, !currentRide && !!pickup && !!destination && !!routeSummary);
  const arrivalClock = useMemo(() => new Date(clock), [clock]);

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
      viewportInsets={mapInsets}
    />
  );

  return (
    <PassengerWorkspace>
      <View
        testID="passenger-header"
        style={{
          backgroundColor: colors.surface,
          paddingTop: insets.top + spacing.x3,
          paddingBottom: spacing.x3,
          paddingLeft: Math.max(insets.left, spacing.x5),
          paddingRight: Math.max(insets.right, spacing.x5),
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.x3,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          {currentRide ? <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Ваша поездка</Text> : <BrandMark size={32} />}
          <Text numberOfLines={1} style={{ ...typography.caption, fontSize: 11, color: colors.inkSecondary }}>
            {currentRide ? currentRide.destination.label : 'Такси рядом · Грахово'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          {!isDesktop && <IconButton icon="orders" size={44} label="Мои поездки" onPress={() => router.push('/orders')} />}
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="Открыть профиль" onPress={() => router.push('/profile')}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <UserAvatar
              name={user?.name ?? 'Профиль'}
              avatarUrl={user?.avatarUrl}
              size={44}
              tone="brand"
              accessible={false}
            />
          </AnimatedPressable>
        </View>
      </View>
      <View style={{ flex: 1, minHeight: 0, flexDirection: isPhone ? 'column' : 'row-reverse' }}>
        <View testID="passenger-map-region" style={{ flex: 1, minHeight: isPhone ? 120 : 0, overflow: 'hidden', backgroundColor: colors.mapFallback }}>
          {map}
          {!currentRide && <View style={{ position: 'absolute', bottom: 24, right: 16 }}>
            <IconButton icon="recenter" label={locationLoading ? 'Определяем местоположение' : 'Использовать моё местоположение'}
              disabled={locationLoading} size={44} onPress={() => void selectCurrentLocation()} />
          </View>}
        </View>
        <View testID="passenger-booking-panel" style={{ flexGrow: isPhone ? 0 : 1, flexShrink: 1, flexBasis: isPhone ? 'auto' : 0,
          width: isPhone ? '100%' : 400, maxWidth: isPhone ? undefined : 440, maxHeight: isPhone ? '72%' : undefined, backgroundColor: colors.surface }}
        >
        <ScrollView ref={bookingScrollRef} style={{ flexGrow: isPhone ? 0 : 1, flexShrink: 1 }}
          contentContainerStyle={{ padding: spacing.x4, paddingTop: spacing.x5, paddingBottom: currentRide ? spacing.x4 : spacing.x2 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BookingPanel pickupEtaMinutes={livePickupEtaMinutes} validationAttempt={validationAttempt} onInvalidRoute={handleInvalidRoute} />
        </ScrollView>
        {!currentRide && <View style={{ padding: spacing.x4, paddingTop: spacing.x2, backgroundColor: colors.surface }}><BookingPanel section="action" validationAttempt={validationAttempt} onInvalidRoute={handleInvalidRoute} /></View>}
        </View>
      </View>
    </PassengerWorkspace>
  );
}
