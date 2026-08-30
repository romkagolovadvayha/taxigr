import { forwardRef } from 'react';
import type { View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { colors, radius, shadows } from '@/theme/tokens';

type Props = {
  icon: AppIconName;
  label: string;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  size?: number;
};

export const IconButton = forwardRef<View, Props>(function IconButton(
  { icon, label, onPress, selected, disabled = false, size = 48 },
  ref,
) {
  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-pressed={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.brand : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.42 : pressed ? 0.82 : 1,
        ...shadows.subtle,
      })}
    >
      <AppIcon name={icon} color={colors.ink} size={22} />
    </AnimatedPressable>
  );
});
