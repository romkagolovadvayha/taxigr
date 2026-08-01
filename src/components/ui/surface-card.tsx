import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  muted?: boolean;
};

export function SurfaceCard({ children, style, muted = false }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: muted ? colors.surfaceSecondary : colors.surface,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          padding: spacing.x4,
          borderWidth: 1,
          borderColor: colors.border,
          gap: spacing.x3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

