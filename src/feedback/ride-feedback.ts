import type { RideOrder, RideStatus } from '@/domain/models';
import type voiceManifest from '../../assets/sounds/voice-manifest.json';

type Hyphenate<S extends string> = S extends `${infer A}_${infer B}` ? `${A}-${Hyphenate<B>}` : S;
export type RideSound = Hyphenate<keyof typeof voiceManifest.clips>;
export type RideFeedbackKind = RideSound | 'trip-started';

export type RideFeedback = {
  kind: RideFeedbackKind;
  haptic: 'success' | 'warning' | 'error';
  sound: RideSound | null;
};

export function shouldPlayRideFeedbackSound(
  isWeb: boolean,
  userHasInteracted: boolean,
): boolean {
  return !isWeb || userHasInteracted;
}

const passengerTransitions: Partial<Record<RideStatus, RideFeedback>> = {
  accepted: { kind: 'taxi-found', haptic: 'success', sound: 'taxi-found' },
  driver_arriving: { kind: 'driver-arriving', haptic: 'success', sound: 'driver-arriving' },
  driver_waiting: { kind: 'driver-arrived', haptic: 'warning', sound: 'driver-arrived' },
  in_progress: { kind: 'trip-started', haptic: 'success', sound: 'ride-started' },
  completed: { kind: 'ride-complete', haptic: 'success', sound: 'ride-complete' },
  cancelled: { kind: 'ride-cancelled', haptic: 'error', sound: 'ride-cancelled' },
};

function spoken(sound: RideSound, haptic: RideFeedback['haptic'] = 'success'): RideFeedback {
  return { kind: sound, sound, haptic };
}

export function completionSound(ride: Pick<RideOrder, 'paymentMethod'>, driver = false): RideSound {
  const base = driver ? 'driver-complete' : 'ride-complete';
  return ride.paymentMethod === 'cash' ? `${base}-cash`
    : ride.paymentMethod === 'transfer' ? `${base}-transfer` : base;
}

export function feedbackForRideChange(
  previous: RideOrder | null,
  current: RideOrder | null,
  userId: string | null,
  isDriver: boolean,
): RideFeedback | null {
  if (!current || !userId) return null;

  const passengerOwnsRide = current.passengerId === userId;
  const isNewRide = !previous || previous.id !== current.id;

  if (isNewRide) {
    if (passengerOwnsRide && current.status === 'searching') return spoken('searching');
    if (isDriver && !passengerOwnsRide && current.status === 'searching') {
      return spoken((current.searchPriceIncreaseMinor ?? 0) > 0 ? 'order-updated' : 'new-order', 'warning');
    }
    if (isDriver && !passengerOwnsRide && current.status === 'accepted') {
      return spoken(current.driverQueuePosition === 2 ? 'order-accepted-queued' : 'order-accepted');
    }
    return null;
  }

  if (previous.status === current.status) {
    if (current.status === 'accepted' && previous.driverQueuePosition === 2 && current.driverQueuePosition !== 2) {
      return passengerOwnsRide ? spoken('driver-ready') : isDriver ? spoken('next-order-ready') : null;
    }
    if (isDriver && !passengerOwnsRide && current.status === 'searching' && current.priceMinor > previous.priceMinor) {
      return { kind: 'order-updated', haptic: 'warning', sound: 'order-updated' };
    }
    if (isDriver && !passengerOwnsRide && current.status === 'searching' && current.updatedAt > previous.updatedAt) {
      return spoken('new-order', 'warning');
    }
    return null;
  }
  if (!passengerOwnsRide && !isDriver) return null;
  if (current.status === 'searching') {
    const released = ['accepted', 'driver_arriving', 'driver_waiting'].includes(previous.status);
    return spoken(passengerOwnsRide ? released ? 'driver-released' : 'searching'
      : released ? 'order-released' : 'new-order', 'warning');
  }
  if (current.status === 'completed') return spoken(completionSound(current, !passengerOwnsRide));
  if (current.status === 'cancelled') {
    return spoken(current.cancellationCode === 'admin' ? 'admin-cancelled'
      : current.cancellationCode === 'search_timeout' ? 'search-timeout'
        : !passengerOwnsRide && current.cancellationCode === 'passenger' ? 'passenger-cancelled'
          : 'ride-cancelled', 'error');
  }
  if (passengerOwnsRide) {
    if (current.status === 'accepted' && current.driverQueuePosition === 2) return spoken('taxi-found-queued');
    return passengerTransitions[current.status] ?? null;
  }
  switch (current.status) {
    case 'accepted': return spoken(current.driverQueuePosition === 2 ? 'order-accepted-queued' : 'order-accepted');
    case 'driver_arriving': return spoken('driver-departed');
    case 'driver_waiting': return spoken('driver-waiting', 'warning');
    case 'in_progress': return spoken('ride-started');
    default: return null;
  }
}
