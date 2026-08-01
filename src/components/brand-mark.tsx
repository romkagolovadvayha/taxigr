import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, spacing, typography } from '@/theme/tokens';

type Props = {
  compact?: boolean;
  size?: number;
};

type BrandGlyphProps = {
  size: number;
  color?: string;
  pinColor?: string;
};

export function BrandGlyph({
  size,
  color = colors.brandInk,
  pinColor = colors.brand,
}: BrandGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M9.5 16c1.5 3.3 5 3.3 6.1 1.5 1.5-2.5 3.9-3.4 6.6-2"
        stroke={color}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeDasharray="1.8 1.5"
      />
      <Path
        d="M9.5 3.8a5.3 5.3 0 00-5.3 5.3c0 4 5.3 8.2 5.3 8.2s5.3-4.2 5.3-8.2a5.3 5.3 0 00-5.3-5.3z"
        fill={color}
      />
      <Circle cx="9.5" cy="9.1" r="1.7" fill={pinColor} />
      <Path
        d="M22.2 15.5a5.3 5.3 0 00-5.3 5.3c0 4 5.3 8.2 5.3 8.2s5.3-4.2 5.3-8.2a5.3 5.3 0 00-5.3-5.3z"
        fill={color}
      />
      <Circle cx="22.2" cy="20.8" r="1.7" fill={pinColor} />
    </Svg>
  );
}

export function BrandMark({ compact = false, size = 40 }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.26),
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          borderCurve: 'continuous',
        }}
      >
        <BrandGlyph size={size * 0.74} color={colors.brandInk} />
      </View>
      {!compact && (
        <Text
          selectable
          style={{
            ...typography.bodyStrong,
            color: colors.ink,
            letterSpacing: -0.25,
          }}
        >
          Такси Грахово
        </Text>
      )}
    </View>
  );
}
