import type { RideOrder } from './models';

export const SEARCH_PRICE_INCREASE_DELAY_MS = 4 * 60 * 1_000;
export const SEARCH_PRICE_INCREASE_MINOR = 3_000;
const choiceRoundingMinor = 5_000;

export function searchPriceIncreaseChoices(priceMinor: number): number[] {
  if (priceMinor <= 0) return [];
  return [...new Set([5, 10, 15, 20].map(percent =>
    Math.ceil(priceMinor * percent / (100 * choiceRoundingMinor)) * choiceRoundingMinor,
  ))];
}

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
    | 'searchPriceIncreaseMinor'
    | 'searchPriceIncreaseLastSlot'
    | 'status'
    | 'pricingMode'
    | 'scheduledAt'
  >,
  now = Date.now(),
  mode: 'automatic' | 'manual' = 'automatic',
): number | null {
  if (ride.status !== 'searching' || ride.driverId || ride.pricingMode === 'driver' ||
    (mode === 'automatic' && ride.scheduledAt)) return null;
  const slot = searchPriceIncreaseSlotAt(
    ride.createdAt,
    now,
    ride.searchPriceIncreaseIntervalMinutes,
  );
  const lastSlot = ride.searchPriceIncreaseLastSlot ?? 0;
  const firstManualIncrease = mode === 'manual' && lastSlot === 0 && !ride.searchPriceIncreaseMinor;
  return firstManualIncrease || slot > lastSlot ? slot : null;
}

export function canOfferSearchPriceIncrease(
  ride: Pick<
    RideOrder,
    | 'createdAt'
    | 'driverId'
    | 'searchPriceIncreaseIntervalMinutes'
    | 'searchPriceIncreaseLastSlot'
    | 'status'
    | 'pricingMode'
    | 'scheduledAt'
  >,
  now = Date.now(),
): boolean {
  return searchPriceIncreaseOfferSlot(ride, now) != null;
}
