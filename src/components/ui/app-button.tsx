import * as Haptics from 'expo-haptics';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'call';

type Props = Omit<PressableProps, 'children' | 'onPress' | 'style'> & {
  children: ReactNode;
  onPress?: PressableProps['onPress'];
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
  foregroundColor?: string;
};

export const AppButton = forwardRef<View, Props>(function AppButton(
  {
    children,
    onPress,
    variant = 'primary',
    disabled = false,
    loading = false,
    fullWidth = true,
    compact = false,
    style,
    accessibilityLabel,
    accessibilityRole = 'button',
    icon,
    foregroundColor,
    ...pressableProps
  },
  ref,
) {
  const backgrounds: Record<Variant, string> = {
    primary: colors.brand,
    secondary: colors.surfaceSecondary,
    quiet: colors.transparent,
    danger: colors.danger,
    call: colors.call,
  };
  const foregrounds: Record<Variant, string> = {
    primary: colors.brandInk,
    secondary: colors.ink,
    quiet: colors.ink,
    danger: colors.dangerInk,
    call: colors.callInk,
  };
  const resolvedForeground = foregroundColor ?? foregrounds[variant];

  const handlePress = (event: GestureResponderEvent) => {
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      {...pressableProps}
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 48 : 56,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: compact ? spacing.x3 : spacing.x6,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: backgrounds[variant],
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled || loading ? 0.42 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={resolvedForeground} />
      ) : icon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          {icon}
          <Text
            numberOfLines={1}
            style={{
              ...(compact ? typography.caption : typography.bodyStrong),
              color: resolvedForeground,
              fontWeight: '700',
            }}
          >
            {children}
          </Text>
        </View>
      ) : (
        <Text
          numberOfLines={1}
          style={{
            ...(compact ? typography.caption : typography.bodyStrong),
            color: resolvedForeground,
            fontWeight: '700',
          }}
        >
          {children}
        </Text>
      )}
    </AnimatedPressable>
  );
});
