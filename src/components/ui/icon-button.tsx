import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { colors, radius, shadows } from '@/theme/tokens';

type Props = {
  icon: AppIconName;
  label: string;
  onPress?: () => void;
  selected?: boolean;
  size?: number;
};

export function IconButton({ icon, label, onPress, selected, size = 48 }: Props) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-pressed={selected}
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
        opacity: pressed ? 0.82 : 1,
        ...shadows.subtle,
      })}
    >
      <AppIcon name={icon} color={colors.ink} size={22} />
    </AnimatedPressable>
  );
}
