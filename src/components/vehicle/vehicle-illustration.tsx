import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { createVehicleColorPalette } from '@/domain/vehicle-colors';
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
  const bodyColors = createVehicleColorPalette(colorHex);
  const illustration = (
    <Svg width={width} height={height} viewBox="0 0 180 90" aria-hidden>
      <Defs>
        <LinearGradient id="vehicleBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bodyColors.highlight} />
          <Stop offset="0.48" stopColor={bodyColors.body} />
          <Stop offset="1" stopColor={bodyColors.shadow} />
        </LinearGradient>
        <LinearGradient id="vehicleGlass" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.vehicleGlassHighlight} />
          <Stop offset="1" stopColor={colors.vehicleGlass} />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 59c2-7 8-12 17-14l25-6 17-20c4-5 9-7 15-7h39c12 0 22 6 29 16l10 15 8 4c4 2 6 6 6 11v11H7v-4c0-3 2-5 5-6z"
        fill="url(#vehicleBody)"
        stroke={colors.vehicleOutline}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <Path
        d="M60 38l14-16c3-4 7-6 12-6h12v22H60zM103 16h21c9 0 17 5 23 13l6 9h-50V16z"
        fill="url(#vehicleGlass)"
        stroke={colors.vehicleOutline}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <Path d="M101 16v22" stroke={colors.vehicleOutline} strokeWidth="2.2" />
      <Path
        d="M21 52h22M157 48h11M13 62h12M161 62h16"
        stroke={bodyColors.highlight}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M87 46h15M139 46h13"
        stroke={colors.vehicleOutline}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity={0.74}
      />
      <Rect
        x="77"
        y="5"
        width="34"
        height="9"
        rx="3.5"
        fill={colors.brand}
        stroke={colors.vehicleOutline}
        strokeWidth="1.8"
      />
      <Rect x="8" y="60" width="13" height="7" rx="2" fill={colors.vehiclePlateSurface} />
      <Rect x="161" y="59" width="13" height="6" rx="2" fill={colors.vehiclePlateSurface} />
      <Circle cx="43" cy="69" r="14" fill={colors.vehicleTire} />
      <Circle cx="43" cy="69" r="7" fill={colors.vehicleWheel} />
      <Circle cx="43" cy="69" r="2" fill={colors.vehicleOutline} />
      <Circle cx="139" cy="69" r="14" fill={colors.vehicleTire} />
      <Circle cx="139" cy="69" r="7" fill={colors.vehicleWheel} />
      <Circle cx="139" cy="69" r="2" fill={colors.vehicleOutline} />
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
