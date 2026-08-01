import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { normalizeVehicleColorHex } from '@/domain/vehicle-colors';
import { colors, radius } from '@/theme/tokens';

type Props = {
  colorHex?: string | null;
  width?: number;
  height?: number;
  framed?: boolean;
};

export function VehicleIllustration({
  colorHex,
  width = 92,
  height = 48,
  framed = false,
}: Props) {
  const bodyColor = normalizeVehicleColorHex(colorHex);
  const illustration = (
    <Svg width={width} height={height} viewBox="0 0 120 60" aria-hidden>
      <Path
        d="M12 40l4-13c1-3 4-5 7-6l16-3 10-10h31c7 0 13 3 17 9l7 10 7 3c3 1 5 4 5 7v8H8v-2c0-2 2-3 4-3z"
        fill={bodyColor}
        stroke={colors.ink}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <Path
        d="M43 18l9-8h26c5 0 10 3 13 8H43z"
        fill="#BFD6E8"
        stroke={colors.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Path d="M67 10v8" stroke={colors.ink} strokeWidth="2" />
      <Path d="M25 30h12M99 29h8" stroke={colors.ink} strokeWidth="2" strokeLinecap="round" />
      <Rect x="54" y="23" width="12" height="3" rx="1.5" fill={colors.ink} opacity={0.65} />
      <Rect x="48" y="2" width="25" height="9" rx="3" fill={colors.brand} stroke={colors.ink} strokeWidth="1.6" />
      <Circle cx="30" cy="44" r="10" fill={colors.ink} />
      <Circle cx="30" cy="44" r="4" fill={colors.inkMuted} />
      <Circle cx="91" cy="44" r="10" fill={colors.ink} />
      <Circle cx="91" cy="44" r="4" fill={colors.inkMuted} />
    </Svg>
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

