import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { colors, spacing } from '@/theme/tokens';

type Props = {
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: number;
};

export function StarRating({ value, onChange, disabled = false, size = 31 }: Props) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Оценка поездки"
      style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.x1 }}
    >
      {[1, 2, 3, 4, 5].map((score) => {
        const selected = score <= value;
        return (
          <AnimatedPressable
            key={score}
            accessibilityRole="radio"
            accessibilityLabel={`${score} ${score === 1 ? 'звезда' : score < 5 ? 'звезды' : 'звёзд'}`}
            aria-checked={score === value}
            aria-disabled={disabled}
            disabled={disabled}
            hitSlop={2}
            onPress={() => {
              if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
              onChange?.(score);
            }}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <AppIcon
              name="star"
              size={size}
              color={selected ? colors.brandPressed : colors.inkMuted}
              strokeWidth={selected ? 1.6 : 1.8}
              filled={selected}
            />
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
