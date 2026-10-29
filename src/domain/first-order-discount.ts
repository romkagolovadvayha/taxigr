import type { PricingScope } from './pricing';

export const firstLocalOrderPromotion = 'first-local-order-50' as const;
export const firstLocalOrderDiscountPercent = 50;

export function isLocalPromotionScope(scope: PricingScope): boolean {
  return scope === 'grahovo' || scope === 'district';
}

/** Money remains in kopeks; an odd kopek is rounded in the passenger's favour. */
export function firstOrderPriceMinor(originalPriceMinor: number): number {
  return Math.floor(originalPriceMinor / 2);
}
