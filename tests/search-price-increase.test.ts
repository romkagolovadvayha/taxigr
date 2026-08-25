import { describe, expect, it } from 'vitest';

import type { RideOrder } from '../src/domain/models';
import {
  canOfferSearchPriceIncrease,
  isSearchPriceIncreaseDelayElapsed,
  searchPriceIncreaseAvailableAt,
  searchPriceIncreaseOfferSlot,
  SEARCH_PRICE_INCREASE_DELAY_MS,
  SEARCH_PRICE_INCREASE_MINOR,
} from '../src/domain/search-price-increase';
import { rideLivePriceMinor } from '../src/domain/waiting';

const createdAt = '2026-08-24T08:00:00.000Z';
const eligibleAt = Date.parse(createdAt) + SEARCH_PRICE_INCREASE_DELAY_MS;

function ride(overrides: Partial<RideOrder> = {}) {
  return {
    status: 'searching',
    createdAt,
    ...overrides,
  } as RideOrder;
}

describe('search price increase', () => {
  it('becomes available exactly after four minutes', () => {
    expect(isSearchPriceIncreaseDelayElapsed(createdAt, eligibleAt - 1)).toBe(false);
    expect(isSearchPriceIncreaseDelayElapsed(createdAt, eligibleAt)).toBe(true);
    expect(SEARCH_PRICE_INCREASE_MINOR).toBe(3_000);
  });

  it('is offered only while no driver has accepted', () => {
    expect(canOfferSearchPriceIncrease(ride(), eligibleAt)).toBe(true);
    expect(canOfferSearchPriceIncrease(ride({ driverId: 'driver-1' }), eligibleAt)).toBe(false);
    expect(canOfferSearchPriceIncrease(ride({ status: 'accepted' }), eligibleAt)).toBe(false);
  });

  it('offers another increase every four minutes without resetting the search clock', () => {
    expect(searchPriceIncreaseOfferSlot(ride(), eligibleAt)).toBe(1);
    expect(
      searchPriceIncreaseOfferSlot(
        ride({
          searchPriceIncreaseMinor: SEARCH_PRICE_INCREASE_MINOR,
          searchPriceIncreaseLastSlot: 1,
        }),
        eligibleAt,
      ),
    ).toBeNull();
    expect(
      searchPriceIncreaseOfferSlot(
        ride({
          searchPriceIncreaseMinor: SEARCH_PRICE_INCREASE_MINOR,
          searchPriceIncreaseLastSlot: 1,
        }),
        eligibleAt + SEARCH_PRICE_INCREASE_DELAY_MS,
      ),
    ).toBe(2);
    expect(
      searchPriceIncreaseAvailableAt(createdAt, 1),
    ).toBe(eligibleAt + SEARCH_PRICE_INCREASE_DELAY_MS);
  });

  it('uses the interval configured for the order', () => {
    const sixMinutes = Date.parse(createdAt) + 6 * 60 * 1_000;
    expect(
      canOfferSearchPriceIncrease(
        ride({ searchPriceIncreaseIntervalMinutes: 6 }),
        sixMinutes - 1,
      ),
    ).toBe(false);
    expect(
      canOfferSearchPriceIncrease(
        ride({ searchPriceIncreaseIntervalMinutes: 6 }),
        sixMinutes,
      ),
    ).toBe(true);
  });

  it('keeps the confirmed increase in the live total without double counting it', () => {
    const increased = ride({
      basePriceMinor: 15_000,
      priceMinor: 18_000,
      searchPriceIncreaseMinor: 3_000,
      waitingSeconds: 0,
      waitingPriceMinor: 0,
    });
    expect(rideLivePriceMinor(increased, eligibleAt)).toBe(18_000);
    expect(rideLivePriceMinor({ ...increased, basePriceMinor: undefined }, eligibleAt)).toBe(
      18_000,
    );
  });
});
