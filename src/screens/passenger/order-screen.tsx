import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { grahovoMapLabel } from '@/data/service-area';

import { useSession } from '@/auth/session-provider';
import { getDemoPassengerProgression } from '@/domain/demo-flow';
import {
  isDestinationAddressBookable,
  isPickupAddressBookable,
} from '@/domain/address-precision';
import { estimatePickupEtaMinutes } from '@/domain/pickup-eta';
import { isReservedRide } from '@/domain/scheduled-ride';
import { TaxiMap } from '@/components/map/taxi-map';
import { MapCredits } from '@/components/map/map-credits';
import { ActiveRidePanel } from '@/components/passenger/active-ride-panel';
import { AddressFields } from '@/components/passenger/address-fields';
import { BookingSubmitButton } from '@/components/passenger/booking-submit-button';
import { FarePeriodIndicator } from '@/components/passenger/fare-period-indicator';
import { ScheduledPickupControl } from '@/components/passenger/scheduled-pickup-control';
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
import { radius, shadows, spacing, typography } from '@/theme/tokens';
import { formatEstimatedArrivalTime } from '@/utils/format';
import { useThemeColors } from '@/theme/theme-provider';

const mapHeaderButtonSize = 44;

function BookingPanel({ pickupEtaMinutes, section = 'content', dense, validationAttempt, onInvalidRoute }: {
  pickupEtaMinutes?: number | null;
  section?: 'content' | 'action';
  dense: boolean;
  validationAttempt: number;
  onInvalidRoute: () => void;
}) {
  const colors = useThemeColors();
  const {
    pickup,
    destinations,
    destination,
    bookingFare,
    scheduledAt,
    currentRide,
    rateRide,
    resetRide,
    quoteStatus,
    requestQuote,
    busy,
    error,
  } = useRide();
  const routeIsBookable =
    isPickupAddressBookable(pickup) &&
    destinations.length > 0 &&
    destinations.every(isDestinationAddressBookable);
  const quotePending =
    routeIsBookable && (quoteStatus === 'idle' || quoteStatus === 'loading');
  const quoteReady = routeIsBookable && quoteStatus === 'ready';

  if (section === 'action') {
    if (currentRide) return null;
    return <BookingSubmitButton
      compact={dense}
      priceMinor={bookingFare.priceMinor}
      etaMinutes={bookingFare.etaMinutes}
      label={scheduledAt ? 'Заказать ко времени' : 'Заказать'}
      accessibilityLabel={scheduledAt && quoteReady
        ? `Перейти к подтверждению предзаказа за ${bookingFare.priceMinor / 100} рублей`
        : undefined}
      loading={quotePending}
      estimateAvailable={quoteReady}
      canRetry={routeIsBookable && quoteStatus === 'error'}
      onPress={() => {
        if (!routeIsBookable) { onInvalidRoute(); return; }
        if (quoteReady) { router.push('/order-confirmation'); return; }
        void requestQuote();
      }}
    />;
  }

  if (currentRide) {
    return (
      <View style={{ gap: spacing.x3 }}>
        <ActiveRidePanel
          ride={currentRide}
          pickupEtaMinutes={pickupEtaMinutes}
          onReset={resetRide}
          onRate={rateRide}
          busy={busy}
          error={error}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.x2 }}>
      <View>
        <AddressFields
          pickup={pickup}
          destinations={destinations}
          destination={destination}
          validationAttempt={validationAttempt}
          compact
          dense={dense}
          hideAddDestination
        />
        <ScheduledPickupControl disabled={busy} dense={dense} />
      </View>
      {!!error && (
        <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function OrderScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const headerTop = insets.top + spacing.x3;
  const { height, isPhone, isDesktop } = useResponsiveLayout();
  const dense = height < 600;
  const sheetOverlap = isPhone ? spacing.x4 : 0;
  const mapInsets = useMemo(() => ({ top: headerTop + mapHeaderButtonSize, bottom: 60 + sheetOverlap }), [headerTop, sheetOverlap]);
  const { vibrationEnabled } = useFeedbackPreferences();
  const [validationAttempt, setValidationAttempt] = useState(0);
  const handleInvalidRoute = () => {
    setValidationAttempt((attempt) => attempt + 1);
    if (vibrationEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
  };
  const { locationError, locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
  const {
    pickup,
    destinations,
    destination,
    routeCoordinates,
    routeSummary,
    bookingFare,
    scheduledAt,
    quoteStatus,
    currentRide,
    transitionRide,
  } = useRide();
  const { token, user } = useSession();
  const demoSession = token?.startsWith('demo:') ?? false;
  const trackedDriver = usePassengerDriverTracking(currentRide, demoSession);
  const driverIsFinishingPreviousRide = currentRide?.driverQueuePosition === 2 || Boolean(currentRide && isReservedRide(currentRide));
  const livePickupEtaMinutes = estimatePickupEtaMinutes({
    driver: driverIsFinishingPreviousRide ? null : trackedDriver.coordinates,
    pickup: currentRide?.pricingMode === 'driver' ? undefined : currentRide?.pickup.coordinates,
    status: currentRide?.status,
  });
  const rideInProgress = currentRide?.status === 'in_progress';
  const routeCompleted = currentRide?.status === 'completed';
  const followDriver =
    !driverIsFinishingPreviousRide &&
    (currentRide?.status === 'driver_arriving' || rideInProgress);
  const clock = useScreenClock(30_000, !currentRide && !!pickup && !!destination && !!routeSummary);
  const arrivalClock = useMemo(() => new Date(clock), [clock]);

  useEffect(() => {
    if (!token?.startsWith('demo:passenger') || !currentRide || currentRide.scheduledAt) return;
    const progression = getDemoPassengerProgression(currentRide.status);
    if (!progression) return;
    const timer = setTimeout(() => transitionRide(progression.next), progression.delay);
    return () => clearTimeout(timer);
  }, [currentRide, token, transitionRide]);

  const map = (
    <TaxiMap
      searching={currentRide?.status === 'searching'}
      pickup={rideInProgress || routeCompleted ? null : currentRide?.pickup ?? pickup}
      destinations={currentRide?.destinations ?? destinations}
      destination={currentRide?.destination ?? destination}
      routeCoordinates={currentRide ? currentRide.routeCoordinates : routeCoordinates}
      onRoutePointEdit={currentRide ? undefined : (index) => router.push({
        pathname: '/address-search',
        params: index === null ? { field: 'pickup', mapEdit: '1' } :
          { field: 'destination', destinationIndex: String(index), mapEdit: '1' },
      })}
      pickupEtaMinutes={
        currentRide
          ? livePickupEtaMinutes != null && livePickupEtaMinutes > 0
            ? livePickupEtaMinutes
            : undefined
          : !scheduledAt && pickup && destination && quoteStatus === 'ready' && routeSummary
            ? bookingFare.etaMinutes
            : undefined
      }
      destinationArrivalLabel={
        !currentRide && !scheduledAt &&
        pickup &&
        destination &&
        quoteStatus === 'ready' &&
        routeSummary
          ? `Прибытие в ${formatEstimatedArrivalTime(
              arrivalClock,
              bookingFare.etaMinutes,
              routeSummary.durationSeconds,
            )}`
          : undefined
      }
      driver={driverIsFinishingPreviousRide ? null : trackedDriver.coordinates}
      driverHeading={trackedDriver.heading}
      driverColorHex={currentRide?.driver?.vehicle.colorHex}
      followDriver={followDriver}
      followZoom={rideInProgress ? 17 : 16}
      trimCompletedRoute={rideInProgress || routeCompleted}
      viewportInsets={mapInsets}
      defaultCenter={grahovoMapLabel}
    />
  );

  return (
    <PassengerWorkspace showNavigationBrand={false}>
      <View style={{ flex: 1, minHeight: 0, flexDirection: isPhone ? 'column' : 'row-reverse' }}>
        <View testID="passenger-map-region" style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: colors.mapFallback }}>
          {map}
          <View testID="passenger-header" pointerEvents="box-none" style={{ position: 'absolute', top: headerTop,
            left: Math.max(insets.left, spacing.x4), right: Math.max(insets.right, spacing.x4), zIndex: 1,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 }}>
            {currentRide ? <View pointerEvents="none" style={{ flexShrink: 1, borderRadius: radius.md,
              backgroundColor: colors.surface, paddingHorizontal: spacing.x3, paddingVertical: spacing.x1 }}>
              <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Ваша поездка</Text>
              <Text numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>{currentRide.destination.label}</Text>
            </View> : <FarePeriodIndicator scheduledAt={scheduledAt} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
              {!isDesktop && <IconButton icon="orders" size={mapHeaderButtonSize} label="Мои поездки" onPress={() => router.push('/orders')} />}
              <AnimatedPressable accessibilityRole="button" accessibilityLabel="Открыть профиль" onPress={() => router.push('/profile')}
                style={{ width: mapHeaderButtonSize, height: mapHeaderButtonSize, borderRadius: radius.pill,
                  alignItems: 'center', justifyContent: 'center' }}>
                <UserAvatar name={user?.name ?? 'Профиль'} avatarUrl={user?.avatarUrl} size={mapHeaderButtonSize} tone="brand" accessible={false} />
              </AnimatedPressable>
            </View>
          </View>
          {!currentRide && <View style={{ position: 'absolute', bottom: sheetOverlap + spacing.x6, right: spacing.x4 }}>
            <IconButton icon="recenter" label={locationLoading ? 'Определяем местоположение' : 'Использовать моё местоположение'}
              disabled={locationLoading} size={44} onPress={() => void selectCurrentLocation()} />
          </View>}
          <MapCredits bottom={sheetOverlap + spacing.x1} />
        </View>
        <View testID="passenger-booking-panel" style={{ flexGrow: isPhone ? 0 : 1, flexShrink: 0, flexBasis: isPhone ? 'auto' : 0,
          width: isPhone ? '100%' : 400, maxWidth: isPhone ? undefined : 440, backgroundColor: colors.surface,
          marginTop: -sheetOverlap, borderTopLeftRadius: isPhone ? radius.sheet : 0,
          borderTopRightRadius: isPhone ? radius.sheet : 0, borderCurve: 'continuous',
          ...(isPhone ? shadows.subtle : undefined) }}
        >
        <View style={{ paddingHorizontal: spacing.x4, paddingTop: currentRide ? spacing.x4 : spacing.x1,
          paddingBottom: currentRide ? spacing.x4 : 0 }}>
          {!currentRide && !!locationError && (
            <Text accessibilityRole="alert" numberOfLines={2} style={{ ...typography.caption, color: colors.warningText, marginBottom: spacing.x2 }}>
              {locationError}
            </Text>
          )}
          <BookingPanel pickupEtaMinutes={livePickupEtaMinutes} dense={dense}
            validationAttempt={validationAttempt} onInvalidRoute={handleInvalidRoute} />
        </View>
        {!currentRide && <View style={{ paddingHorizontal: spacing.x4, paddingTop: spacing.x2,
          paddingBottom: dense ? spacing.x2 : spacing.x4 }}>
          <BookingPanel section="action" dense={dense} validationAttempt={validationAttempt} onInvalidRoute={handleInvalidRoute} />
        </View>}
        </View>
      </View>
    </PassengerWorkspace>
  );
}
