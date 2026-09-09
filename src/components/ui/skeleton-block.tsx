import { View, type DimensionValue } from 'react-native';

import { radius } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  width: DimensionValue;
  height: number;
  color?: string;
  opacity?: number;
};

export function SkeletonBlock({
  width,
  height,
  color: customColor,
  opacity = 1,
}: Props) {
  const colors = useThemeColors();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: Math.min(radius.sm, height / 2),
        backgroundColor: customColor ?? colors.surfaceSecondary,
        opacity,
      }}
    />
  );
}
