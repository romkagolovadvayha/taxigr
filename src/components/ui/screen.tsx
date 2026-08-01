import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, spacing } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({ children, scroll = true, style, contentStyle }: Props) {
  const { contentInset } = useResponsiveLayout();
  const baseContent: ViewStyle = {
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
    paddingHorizontal: contentInset,
    paddingVertical: spacing.x6,
    gap: spacing.x5,
  };

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.canvas }, style]}>
        <View style={[baseContent, { flex: 1 }, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={[{ flex: 1, backgroundColor: colors.canvas }, style]}
      contentContainerStyle={[baseContent, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

