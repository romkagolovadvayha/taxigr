import { Host, Switch as NativeSwitch } from '@expo/ui';
import {
  Platform,
  type StyleProp,
  type SwitchProps,
  View,
  type ViewStyle,
} from "react-native";

import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { useThemeColors } from "@/theme/theme-provider";

type Props = {
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (value: boolean) => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
  thumbColor?: string;
  trackColor?: SwitchProps["trackColor"];
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
  const colors = useThemeColors();
  const resolvedTrackColor = {
    false: trackColor?.false ?? colors.borderStrong,
    true: trackColor?.true ?? colors.brand,
  };
  const resolvedThumbColor =
    thumbColor ?? (value ? colors.brandInk : colors.surface);
  const changeValue = (nextValue: boolean) => {
    if (!disabled && nextValue !== value) void onValueChange(nextValue);
  };

  if (Platform.OS !== 'web') {
    // Let the native toggle own touch/drag events. A touchable parent around a
    // controlled switch without onValueChange swallows/reverts Android changes.
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') changeValue(!value);
        }}
        onAccessibilityTap={() => changeValue(!value)}
        style={[{ minWidth: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, style]}
      >
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Host matchContents seedColor={resolvedTrackColor.true}>
            <NativeSwitch value={value} disabled={disabled} onValueChange={changeValue} />
          </Host>
        </View>
      </View>
    );
  }
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      feedback="subtle"
      onPress={() => changeValue(!value)}
      style={({ pressed }) => [
        {
          minWidth: 44,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
        <View
          style={{
            width: 51,
            height: 31,
            padding: 2,
            borderRadius: 16,
            backgroundColor: value
              ? resolvedTrackColor.true
              : resolvedTrackColor.false,
          }}
        >
          <View
            style={{
              width: 27,
              height: 27,
              borderRadius: 14,
              backgroundColor: resolvedThumbColor,
              transform: [{ translateX: value ? 20 : 0 }],
            }}
          />
        </View>
    </AnimatedPressable>
  );
}
