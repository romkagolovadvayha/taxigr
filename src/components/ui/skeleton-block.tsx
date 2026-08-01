import { View, type DimensionValue } from 'react-native';

import { colors, radius } from '@/theme/tokens';

type Props = {
  width: DimensionValue;
  height: number;
  color?: string;
  opacity?: number;
};

export function SkeletonBlock({
  width,
  height,
  color = colors.surfaceSecondary,
  opacity = 1,
}: Props) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: Math.min(radius.sm, height / 2),
        backgroundColor: color,
        opacity,
      }}
    />
  );
}
