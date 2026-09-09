import type { TariffCode } from '@/domain/models';

export const tariffImageSources = {
  economy: require('../../../assets/tariffs/economy-car.webp'),
  child: require('../../../assets/tariffs/child-seat.webp'),
} satisfies Record<TariffCode, number>;

// Also used by the web document preload so the browser reuses the same asset URL.
export const inlineTariffImageSources = {
  economy: require('../../../assets/tariffs/economy-car-compact.webp'),
  child: require('../../../assets/tariffs/child-seat-compact.webp'),
} satisfies Record<TariffCode, number>;
