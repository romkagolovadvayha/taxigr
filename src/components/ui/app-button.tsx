import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  icon?: ReactNode;
  foregroundColor?: string;
};

export function AppButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  accessibilityLabel,
  icon,
  foregroundColor,
}: Props) {
  const backgrounds: Record<Variant, string> = {
    primary: colors.brand,
    secondary: colors.surfaceSecondary,
    quiet: colors.transparent,
    danger: colors.danger,
  };
  const foregrounds: Record<Variant, string> = {
    primary: colors.brandInk,
    secondary: colors.ink,
    quiet: colors.ink,
    danger: '#FFFFFF',
  };
  const resolvedForeground = foregroundColor ?? foregrounds[variant];

  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          minHeight: 56,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: spacing.x6,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: backgrounds[variant],
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.42 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={resolvedForeground} />
      ) : icon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          {icon}
          <Text style={{ ...typography.bodyStrong, color: resolvedForeground }}>{children}</Text>
        </View>
      ) : (
        <Text style={{ ...typography.bodyStrong, color: resolvedForeground }}>{children}</Text>
      )}
    </Pressable>
  );
}
