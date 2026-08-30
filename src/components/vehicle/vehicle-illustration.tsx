import { Image } from 'expo-image';
import { View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

const vehiclePhoto = require('../../../assets/tariffs/economy-car.png');

type Props = {
  colorHex?: string | null;
  width?: number;
  height?: number;
  framed?: boolean;
};

export function VehicleIllustration({
  width = 92,
  height = 48,
  framed = false,
}: Props) {
  const illustration = (
    <Image
      source={vehiclePhoto}
      style={{ width, height }}
      contentFit="contain"
      alt=""
      accessible={false}
    />
  );

  if (!framed) return illustration;
  return (
    <View
      style={{
        minWidth: width + 16,
        minHeight: height + 16,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceSecondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {illustration}
    </View>
  );
}
