import { Platform, Switch, type StyleProp, type SwitchProps, View, type ViewStyle } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';

type Props = {
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (value: boolean) => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
  thumbColor?: string;
  trackColor?: SwitchProps['trackColor'];
  value: boolean;
};

/**
 * A Switch with a single accessible hit target on every platform.
 * React Native Web's native Switch currently ignores Space; the pressable
 * wrapper supplies the expected WAI-ARIA keyboard activation.
 */
export function AccessibleSwitch({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  style,
  thumbColor,
  trackColor,
  value,
}: Props) {
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      feedback="subtle"
      onPress={() => void onValueChange(!value)}
      style={({ pressed }) => [
        {
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      {Platform.OS === 'web' ? (
        <View
          style={{
            width: 51,
            height: 31,
            padding: 2,
            borderRadius: 16,
            backgroundColor: value ? trackColor?.true ?? '#81B0FF' : trackColor?.false ?? '#767577',
          }}
        >
          <View
            style={{
              width: 27,
              height: 27,
              borderRadius: 14,
              backgroundColor: thumbColor ?? '#F4F3F4',
              transform: [{ translateX: value ? 20 : 0 }],
            }}
          />
        </View>
      ) : (
        <Switch
          accessible={false}
          accessibilityElementsHidden
          disabled={disabled}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{ minWidth: 44, minHeight: 44 }}
          thumbColor={thumbColor}
          trackColor={trackColor}
          value={value}
        />
      )}
    </AnimatedPressable>
  );
}
