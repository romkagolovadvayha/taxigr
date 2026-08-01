import type { RideOrder, RideStatus } from '@/domain/models';

export type RideFeedbackKind =
  | 'taxi-found'
  | 'driver-arrived'
  | 'new-order'
  | 'trip-started'
  | 'ride-complete'
  | 'ride-cancelled';

export type RideFeedback = {
  kind: RideFeedbackKind;
  haptic: 'success' | 'warning' | 'error';
  sound:
    | 'taxi-found'
    | 'driver-arrived'
    | 'new-order'
    | 'ride-started'
    | 'ride-complete'
    | 'ride-cancelled'
    | null;
};

export function shouldPlayRideFeedbackSound(
  isWeb: boolean,
  userInitiated: boolean,
): boolean {
  return !isWeb || userInitiated;
}

const passengerTransitions: Partial<Record<RideStatus, RideFeedback>> = {
  accepted: { kind: 'taxi-found', haptic: 'success', sound: 'taxi-found' },
  driver_waiting: { kind: 'driver-arrived', haptic: 'warning', sound: 'driver-arrived' },
  in_progress: { kind: 'trip-started', haptic: 'success', sound: 'ride-started' },
  completed: { kind: 'ride-complete', haptic: 'success', sound: 'ride-complete' },
  cancelled: { kind: 'ride-cancelled', haptic: 'error', sound: 'ride-cancelled' },
};

const driverTransitions: Partial<Record<RideStatus, RideFeedback>> = {
  completed: { kind: 'ride-complete', haptic: 'success', sound: 'ride-complete' },
  cancelled: { kind: 'ride-cancelled', haptic: 'error', sound: 'ride-cancelled' },
};

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
    if (isDriver && !passengerOwnsRide && current.status === 'searching') {
      return { kind: 'new-order', haptic: 'warning', sound: 'new-order' };
    }
    return null;
  }

  if (previous.status === current.status) return null;
  return passengerOwnsRide
    ? passengerTransitions[current.status] ?? null
    : isDriver
      ? driverTransitions[current.status] ?? null
      : null;
}
