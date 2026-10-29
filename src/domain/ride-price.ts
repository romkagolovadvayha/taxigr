import type { RideOrder } from './models';

export function isRidePricePending(ride: Pick<RideOrder, 'pricingMode' | 'manualPriceSet'>): boolean {
  return ride.pricingMode === 'driver' && !ride.manualPriceSet;
}

export function ridePriceLabel(ride: Pick<RideOrder, 'pricingMode' | 'manualPriceSet' | 'priceMinor'>): string {
  return isRidePricePending(ride) ? 'Стоимость определит водитель' :
    `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(ride.priceMinor / 100)} ₽`;
}
