import { fareRoundingMinor, fareRoundingMode, roundFareMinor, type FareRoundingMode, type PricingScope } from './pricing';

export const firstLocalOrderPromotion = 'first-local-order-30' as const;
export const firstLocalOrderDiscountPercent = 30;
export const discountedFareRoundingMinor = fareRoundingMinor;

export type FirstOrderPromotionSettings = {
  discountPercent: number;
  messageTemplate: string;
};

export const discountPercentTag = '{discount}';
export const promotionMessageMaxLength = 600;
export const defaultFirstOrderPromotionSettings: FirstOrderPromotionSettings = {
  discountPercent: firstLocalOrderDiscountPercent,
  messageTemplate: 'Скидка {discount}% на первый заказ по Грахово и району. На межгород акция не действует.',
};

export function renderPromotionMessage(settings: FirstOrderPromotionSettings): string {
  return settings.messageTemplate.replace(/\{discount\}/gu, String(settings.discountPercent)).trim();
}

export function firstOrderPromotionCode(discountPercent: number): `first-local-order-${number}` {
  return `first-local-order-${discountPercent}`;
}

export function firstOrderWaitingRoundingMinor(promotionCode: string | null | undefined): number {
  return promotionCode === firstLocalOrderPromotion || promotionCode === 'first-local-order-20' ? 1_000 : 1;
}

export function isLocalPromotionScope(scope: PricingScope): boolean {
  return scope === 'grahovo' || scope === 'district';
}

/** Per-minute rates retain kopek precision before the total is rounded. */
export function firstOrderRateMinor(originalPriceMinor: number, discountPercent = firstLocalOrderDiscountPercent): number {
  return Math.ceil(originalPriceMinor * (100 - discountPercent) / 100);
}

export function firstOrderPriceMinor(
  originalPriceMinor: number,
  roundingMinor = discountedFareRoundingMinor,
  mode: FareRoundingMode = fareRoundingMode,
  discountPercent = firstLocalOrderDiscountPercent,
): number {
  return roundFareMinor(firstOrderRateMinor(originalPriceMinor, discountPercent), roundingMinor, mode);
}
