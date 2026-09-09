import {
  Platform,
  Switch,
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
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      {Platform.OS === "web" ? (
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
      ) : (
        <Switch
          accessible={false}
          accessibilityElementsHidden
          disabled={disabled}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{ minWidth: 44, minHeight: 44 }}
          thumbColor={resolvedThumbColor}
          trackColor={resolvedTrackColor}
          value={value}
        />
      )}
    </AnimatedPressable>
  );
}
