import { Image } from 'expo-image';
import { View } from 'react-native';

import type { TariffCode } from '@/domain/models';

type Props = {
  code: TariffCode;
  compact?: boolean;
};

const sources = {
  economy: require('../../../assets/tariffs/economy-car.png'),
  child: require('../../../assets/tariffs/child-seat.png'),
} satisfies Record<TariffCode, number>;

export function TariffIllustration({ code, compact = false }: Props) {
  const isChild = code === 'child';

  if (compact) {
    return (
      <View
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          width: isChild ? 42 : 74,
          height: 42,
          left: 10,
          top: isChild ? 1 : -1,
        }}
      >
        <Image
          source={sources[code]}
          contentFit="contain"
          contentPosition="left center"
          accessible={false}
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        pointerEvents: 'none',
        width: 58,
        height: 40,
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <Image
        source={sources[code]}
        contentFit="contain"
        contentPosition="left center"
        accessible={false}
        style={{
          width: isChild ? 36 : 58,
          height: 36,
        }}
      />
    </View>
  );
}
