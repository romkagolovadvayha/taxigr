import { Image } from 'expo-image';

import type { TariffCode } from '@/domain/models';

const sources = {
  economy: require('../../../assets/tariffs/economy-car.webp'),
  child: require('../../../assets/tariffs/child-seat.webp'),
} satisfies Record<TariffCode, number>;

export function TariffIllustration({ code, compact = false }: { code: TariffCode; compact?: boolean }) {
  return (
    <Image source={sources[code]} contentFit="contain" contentPosition="center" accessible={false} alt=""
      style={{ width: compact ? 104 : 124, height: compact ? 62 : 76 }} />
  );
}
