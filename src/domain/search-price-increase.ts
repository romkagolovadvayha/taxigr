import type { RideOrder } from './models';

export const SEARCH_PRICE_INCREASE_DELAY_MS = 4 * 60 * 1_000;
export const SEARCH_PRICE_INCREASE_MINOR = 3_000;

function intervalMilliseconds(intervalMinutes = 4): number {
  const normalizedMinutes =
    Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 4;
  return normalizedMinutes * 60 * 1_000;
}

export function searchPriceIncreaseSlotAt(
  createdAt: string | Date,
  now = Date.now(),
  intervalMinutes = 4,
): number {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now - timestamp) / intervalMilliseconds(intervalMinutes)));
}

export function searchPriceIncreaseAvailableAt(
  createdAt: string | Date,
  afterSlot = 0,
  intervalMinutes = 4,
): number | null {
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp)
    ? timestamp + (Math.max(0, afterSlot) + 1) * intervalMilliseconds(intervalMinutes)
    : null;
}

export function isSearchPriceIncreaseDelayElapsed(
  createdAt: string | Date,
  now = Date.now(),
  intervalMinutes = 4,
): boolean {
  return searchPriceIncreaseSlotAt(createdAt, now, intervalMinutes) >= 1;
}

export function searchPriceIncreaseOfferSlot(
  ride: Pick<
    RideOrder,
    | 'createdAt'
    | 'driverId'
    | 'searchPriceIncreaseIntervalMinutes'
    | 'searchPriceIncreaseLastSlot'
    | 'status'
  >,
  now = Date.now(),
): number | null {
  if (ride.status !== 'searching' || ride.driverId) return null;
  const slot = searchPriceIncreaseSlotAt(
    ride.createdAt,
    now,
    ride.searchPriceIncreaseIntervalMinutes,
  );
  return slot > (ride.searchPriceIncreaseLastSlot ?? 0) ? slot : null;
}

export function canOfferSearchPriceIncrease(
  ride: Pick<
    RideOrder,
    | 'createdAt'
    | 'driverId'
    | 'searchPriceIncreaseIntervalMinutes'
    | 'searchPriceIncreaseLastSlot'
    | 'status'
  >,
  now = Date.now(),
): boolean {
  return searchPriceIncreaseOfferSlot(ride, now) != null;
}
