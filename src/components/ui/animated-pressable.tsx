import { forwardRef, useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type MouseEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

export type AnimatedPressableState = PressableStateCallbackType & {
  readonly hovered: boolean;
};

type AnimatedPressableStyle =
  | StyleProp<ViewStyle>
  | ((state: AnimatedPressableState) => StyleProp<ViewStyle>);

type Props = Omit<PressableProps, 'children' | 'style'> & {
  children?: ReactNode | ((state: AnimatedPressableState) => ReactNode);
  /**
   * Style owned by this component. Use it when rendered through Expo Router's
   * Link `asChild`, whose Slot replaces the standard `style` prop on web.
   */
  contentStyle?: AnimatedPressableStyle;
  feedback?: 'standard' | 'subtle';
  onKeyDown?: (event: WebKeyDownEvent) => void;
  style?: AnimatedPressableStyle;
};

type WebKeyDownEvent = {
  nativeEvent: {
    code?: string;
    key?: string;
    repeat?: boolean;
  };
  preventDefault: () => void;
};

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);
const pressEasing = Easing.bezier(...motion.easing.out);

/**
 * Consistent, interruptible pointer/touch feedback for every tappable surface.
 * Keyboard activation skips motion; Reduced Motion keeps opacity feedback only.
 */
export const AnimatedPressable = forwardRef<View, Props>(function AnimatedPressable(
  {
    children,
    contentStyle,
    disabled,
    feedback = 'standard',
    accessibilityRole,
    onHoverIn,
    onHoverOut,
    onKeyDown,
    onPress,
    onPressIn,
    onPressOut,
    style,
    ...props
  },
  ref,
) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const pressScale = feedback === 'subtle' ? motion.scale.subtlePress : motion.scale.press;
  const keyboardPress = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const animateTo = useCallback(
    (value: number, duration: number) => {
      progress.value = withTiming(value, {
        duration: reduceMotion ? 0 : duration,
        easing: pressEasing,
      });
    },
    [progress, reduceMotion],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      const eventType = (event.nativeEvent as unknown as { type?: string }).type;
      keyboardPress.current = eventType === 'keydown';
      setPressed(true);
      if (keyboardPress.current) {
        progress.value = 0;
      } else {
        animateTo(1, motion.duration.pressIn);
      }
      onPressIn?.(event);
    },
    [animateTo, onPressIn, progress],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      if (keyboardPress.current) {
        progress.value = 0;
        keyboardPress.current = false;
      } else {
        animateTo(0, motion.duration.pressOut);
      }
      onPressOut?.(event);
    },
    [animateTo, onPressOut, progress],
  );

  const handleHoverIn = useCallback(
    (event: MouseEvent) => {
      setHovered(true);
      onHoverIn?.(event);
    },
    [onHoverIn],
  );

  const handleHoverOut = useCallback(
    (event: MouseEvent) => {
      setHovered(false);
      onHoverOut?.(event);
    },
    [onHoverOut],
  );

  const handleKeyDown = useCallback(
    (event: WebKeyDownEvent) => {
      onKeyDown?.(event);
      const { code, key, repeat } = event.nativeEvent;
      const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
      const supportsSpaceActivation =
        accessibilityRole === 'checkbox' ||
        accessibilityRole === 'menuitem' ||
        accessibilityRole === 'radio' ||
        accessibilityRole === 'switch' ||
        accessibilityRole === 'tab';

      // React Native Web currently handles Space only for button-like roles.
      // WAI-ARIA toggle/select controls must also activate with Space.
      if (
        !disabled &&
        !repeat &&
        isSpace &&
        supportsSpaceActivation
      ) {
        event.preventDefault();
        onPress?.(event as unknown as GestureResponderEvent);
      }
    },
    [accessibilityRole, disabled, onKeyDown, onPress],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion ? 1 : 1 - progress.value * (1 - pressScale),
      },
    ],
  }));
  const state: AnimatedPressableState = { pressed, hovered };
  const ownedStyle = contentStyle ?? style;
  const resolvedStyle = typeof ownedStyle === 'function' ? ownedStyle(state) : ownedStyle;
  const resolvedChildren = typeof children === 'function' ? children(state) : children;
  const webKeyboardProps = { onKeyDown: handleKeyDown } as unknown as PressableProps;

  return (
    <AnimatedPressableBase
      {...props}
      ref={ref as never}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, animatedStyle]}
      {...webKeyboardProps}
    >
      {resolvedChildren}
    </AnimatedPressableBase>
  );
});
