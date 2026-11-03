import { describe, expect, it } from 'vitest';

import {
  firstLocalOrderDiscountPercent,
  firstLocalOrderPromotion,
  firstOrderPriceMinor,
  firstOrderRateMinor,
  isLocalPromotionScope,
} from '../src/domain/first-order-discount';
import type { RideOrder } from '../src/domain/models';
import { calculateWaitingChargeMinor } from '../src/domain/pricing';
import { rideLivePriceMinor } from '../src/domain/waiting';

describe('first local order discount', () => {
  it('offers 20 percent only inside Grahovo and its district', () => {
    expect(firstLocalOrderDiscountPercent).toBe(20);
    expect(firstLocalOrderPromotion).toBe('first-local-order-20');
    expect(isLocalPromotionScope('grahovo')).toBe(true);
    expect(isLocalPromotionScope('district')).toBe(true);
    expect(isLocalPromotionScope('intercity')).toBe(false);
  });

  it.each([
    [0, 0],
    [15_000, 12_000],
    [15_500, 13_000],
    [22_000, 18_000],
    [25_000, 20_000],
    [25_001, 21_000],
    [57_000, 46_000],
  ])('prices %i kopeks with 20 percent off, rounded up to %i', (original, expected) => {
    expect(firstOrderPriceMinor(original)).toBe(expected);
  });

  it('discounts the per-minute rate before rounding the accumulated waiting charge', () => {
    const rate = firstOrderRateMinor(400);
    expect(rate).toBe(320);
    expect(calculateWaitingChargeMinor(180, 3, rate, 1_000)).toBe(0);
    expect(calculateWaitingChargeMinor(181, 3, rate, 1_000)).toBe(1_000);
    expect(calculateWaitingChargeMinor(360, 3, rate, 1_000)).toBe(1_000);
    expect(calculateWaitingChargeMinor(361, 3, rate, 1_000)).toBe(2_000);
  });

  it('shows the same rounded live total and preserves rates of earlier orders', () => {
    const ride = {
      promotionCode: 'first-local-order-20',
      basePriceMinor: 12_000,
      searchPriceIncreaseMinor: 3_000,
      waitingSeconds: 241,
      waitingFreeMinutes: 3,
      waitingPerMinuteMinor: 320,
    } as RideOrder;
    expect(rideLivePriceMinor(ride)).toBe(16_000);
    expect(rideLivePriceMinor({ ...ride, promotionCode: 'first-local-order-50', waitingPerMinuteMinor: 200 })).toBe(15_400);
    expect(rideLivePriceMinor({ ...ride, promotionCode: undefined, waitingPerMinuteMinor: 400 })).toBe(15_800);
  });
});
