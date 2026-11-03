import { fareRoundingMinor, roundFareMinor, type PricingScope } from './pricing';

export const firstLocalOrderPromotion = 'first-local-order-20' as const;
export const firstLocalOrderDiscountPercent = 20;

export function isLocalPromotionScope(scope: PricingScope): boolean {
  return scope === 'grahovo' || scope === 'district';
}

/** Per-minute rates retain kopek precision before the total is rounded. */
export function firstOrderRateMinor(originalPriceMinor: number): number {
  return Math.ceil(originalPriceMinor * (100 - firstLocalOrderDiscountPercent) / 100);
}

export function firstOrderPriceMinor(originalPriceMinor: number, roundingMinor = fareRoundingMinor): number {
  return roundFareMinor(firstOrderRateMinor(originalPriceMinor), roundingMinor);
}
