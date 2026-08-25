import type { RideOrder } from './models';
import { calculateWaitingChargeMinor } from './pricing';

export function formatWaitingDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function activeWaitingSeconds(
  waitingStartedAt: string | undefined,
  now = Date.now(),
): number {
  if (!waitingStartedAt) return 0;
  const startedAt = Date.parse(waitingStartedAt);
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1_000));
}

export function rideWaitingSeconds(ride: RideOrder, now = Date.now()): number {
  return (ride.waitingSeconds ?? 0) + activeWaitingSeconds(ride.waitingStartedAt, now);
}

export function rideWaitingPriceMinor(ride: RideOrder, now = Date.now()): number {
  return calculateWaitingChargeMinor(
    rideWaitingSeconds(ride, now),
    ride.waitingFreeMinutes ?? 3,
    ride.waitingPerMinuteMinor ?? 400,
  );
}

export function rideLivePriceMinor(ride: RideOrder, now = Date.now()): number {
  const searchPriceIncreaseMinor = ride.searchPriceIncreaseMinor ?? 0;
  const basePriceMinor =
    ride.basePriceMinor ??
    ride.priceMinor - (ride.waitingPriceMinor ?? 0) - searchPriceIncreaseMinor;
  return basePriceMinor + searchPriceIncreaseMinor +
    rideWaitingPriceMinor(ride, now);
}
