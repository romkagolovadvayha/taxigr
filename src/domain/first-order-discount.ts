import { fareRoundingMinor, fareRoundingMode, roundFareMinor, type FareRoundingMode, type PricingScope } from './pricing';

export const firstLocalOrderPromotion = 'first-local-order-30' as const;
export const firstLocalOrderDiscountPercent = 30;
export const discountedFareRoundingMinor = fareRoundingMinor;

export function firstOrderWaitingRoundingMinor(promotionCode: string | null | undefined): number {
  return promotionCode === firstLocalOrderPromotion || promotionCode === 'first-local-order-20' ? 1_000 : 1;
}

export function isLocalPromotionScope(scope: PricingScope): boolean {
  return scope === 'grahovo' || scope === 'district';
}

/** Per-minute rates retain kopek precision before the total is rounded. */
export function firstOrderRateMinor(originalPriceMinor: number): number {
  return Math.ceil(originalPriceMinor * (100 - firstLocalOrderDiscountPercent) / 100);
}

export function firstOrderPriceMinor(
  originalPriceMinor: number,
  roundingMinor = discountedFareRoundingMinor,
  mode: FareRoundingMode = fareRoundingMode,
): number {
  return roundFareMinor(firstOrderRateMinor(originalPriceMinor), roundingMinor, mode);
}
