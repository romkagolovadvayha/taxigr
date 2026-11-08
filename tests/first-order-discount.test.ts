import { describe, expect, it } from 'vitest';

import {
  firstLocalOrderDiscountPercent,
  firstLocalOrderPromotion,
  firstOrderPriceMinor,
  firstOrderRateMinor,
  isLocalPromotionScope,
  defaultFirstOrderPromotionSettings,
  firstOrderPromotionCode,
  renderPromotionMessage,
} from '../src/domain/first-order-discount';
import type { RideOrder } from '../src/domain/models';
import { calculateWaitingChargeMinor } from '../src/domain/pricing';
import { rideLivePriceMinor } from '../src/domain/waiting';

describe('first local order discount', () => {
  it('offers 30 percent only inside Grahovo and its district', () => {
    expect(firstLocalOrderDiscountPercent).toBe(30);
    expect(firstLocalOrderPromotion).toBe('first-local-order-30');
    expect(isLocalPromotionScope('grahovo')).toBe(true);
    expect(isLocalPromotionScope('district')).toBe(true);
    expect(isLocalPromotionScope('intercity')).toBe(false);
  });

  it.each([
    [0, 0],
    [15_000, 11_000],
    [15_500, 11_000],
    [20_000, 14_000],
    [22_000, 15_000],
    [25_000, 18_000],
    [25_001, 18_000],
    [33_000, 23_000],
    [57_000, 40_000],
  ])('prices %i kopeks with 30 percent off, rounded to %i', (original, expected) => {
    expect(firstOrderPriceMinor(original)).toBe(expected);
  });

  it.each([[15_000,15_000],[22_000,20_000],[57_000,40_000],[85_000,60_000]])(
    'can round the discounted %i kopeks up to a fifty-ruble multiple', (original, expected) => {
      expect(firstOrderPriceMinor(original, 5_000, 'up')).toBe(expected);
    },
  );

  it('discounts the per-minute rate before rounding the accumulated waiting charge', () => {
    const rate = firstOrderRateMinor(400);
    expect(rate).toBe(280);
    expect(calculateWaitingChargeMinor(180, 3, rate, 1_000)).toBe(0);
    expect(calculateWaitingChargeMinor(181, 3, rate, 1_000)).toBe(1_000);
    expect(calculateWaitingChargeMinor(360, 3, rate, 1_000)).toBe(1_000);
    expect(calculateWaitingChargeMinor(361, 3, rate, 1_000)).toBe(2_000);
    expect(calculateWaitingChargeMinor(181, 3, rate, 1_000, 'nearest')).toBe(0);
    expect(calculateWaitingChargeMinor(241, 3, rate, 1_000, 'nearest')).toBe(1_000);
  });

  it('shows the same rounded live total and preserves rates of earlier orders', () => {
    const ride = {
      promotionCode: 'first-local-order-20',
      basePriceMinor: 12_000,
      searchPriceIncreaseMinor: 3_000,
      waitingSeconds: 241,
      waitingFreeMinutes: 3,
      waitingPerMinuteMinor: 320,
    } as unknown as RideOrder;
    expect(rideLivePriceMinor(ride)).toBe(16_000);
    expect(rideLivePriceMinor({...ride,waitingSeconds:181,fareRoundingMinor:1_000,fareRoundingMode:'nearest'})).toBe(15_000);
    expect(rideLivePriceMinor({...ride,waitingSeconds:181,fareRoundingMinor:1_000})).toBe(16_000);
    expect(rideLivePriceMinor({ ...ride, basePriceMinor: 15_000, searchPriceIncreaseMinor: 5_000, fareRoundingMinor: 5_000 })).toBe(25_000);
    expect(rideLivePriceMinor({ ...ride, promotionCode: 'first-local-order-30', waitingPerMinuteMinor: 280 })).toBe(16_000);
    expect(rideLivePriceMinor({ ...ride, promotionCode: 'first-local-order-50', waitingPerMinuteMinor: 200 })).toBe(15_400);
    expect(rideLivePriceMinor({ ...ride, promotionCode: undefined, waitingPerMinuteMinor: 400 })).toBe(15_800);
  });

  it.each([20, 30, 45, 100])('uses the configured %i percent for price, rate and message', percent => {
    expect(firstOrderPriceMinor(100_000, 1_000, 'nearest', percent)).toBe((100 - percent) * 1_000);
    expect(firstOrderRateMinor(400, percent)).toBe((100 - percent) * 4);
    expect(renderPromotionMessage({ discountPercent: percent, messageTemplate: 'Скидка {discount}%' })).toBe(`Скидка ${percent}%`);
    expect(firstOrderPromotionCode(percent)).toBe(`first-local-order-${percent}`);
  });

  it.each([
    ['{discount}% сегодня, завтра тоже {discount}%', '30% сегодня, завтра тоже 30%'],
    ['Сегодня {discount}% на поездку', 'Сегодня 30% на поездку'],
    ['Акция на первый заказ', 'Акция на первый заказ'],
    ['', ''],
    ['   ', ''],
  ])('allows moving, repeating and omitting the tag in %j', (messageTemplate, expected) => {
    expect(renderPromotionMessage({ ...defaultFirstOrderPromotionSettings, messageTemplate })).toBe(expected);
    expect(firstOrderPriceMinor(100_000)).toBe(70_000);
  });
});
