import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { useCallback } from 'react';
import {
  Pressable,
  Text,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  interpolate,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  enabled: boolean;
  onExpand: () => void;
  hint: string;
  expanded?: boolean;
  onCollapse?: () => void;
  collapseHint?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

const EXPAND_DISTANCE = 72;
const EXPAND_VELOCITY = -700;
const MAX_PULL_DISTANCE = 120;

export function DraggableSheet({
  children,
  enabled,
  onExpand,
  hint,
  expanded = false,
  onCollapse,
  collapseHint,
  onLayout,
  style,
}: Props) {
  const translationY = useSharedValue(0);
  const canToggle = enabled && (!expanded || Boolean(onCollapse));
  const toggle = useCallback(() => {
    if (!canToggle) return;
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.selectionAsync();
    }
    if (expanded) {
      onCollapse?.();
      return;
    }
    onExpand();
  }, [canToggle, expanded, onCollapse, onExpand]);

  const pan = Gesture.Pan()
    .enabled(canToggle)
    .activeOffsetY([-8, 8])
    .onUpdate((event) => {
      translationY.value = expanded
        ? clamp(event.translationY, 0, MAX_PULL_DISTANCE)
        : clamp(event.translationY, -MAX_PULL_DISTANCE, 0);
    })
    .onEnd((event) => {
      const directionalDistance = expanded ? translationY.value : -translationY.value;
      const directionalVelocity = expanded ? event.velocityY : -event.velocityY;
      const shouldToggle =
        directionalDistance >= EXPAND_DISTANCE ||
        directionalVelocity >= Math.abs(EXPAND_VELOCITY);
      if (!shouldToggle) {
        translationY.value = withSpring(0, {
          damping: 20,
          stiffness: 240,
        });
        return;
      }
      const target = expanded ? MAX_PULL_DISTANCE : -MAX_PULL_DISTANCE;
      translationY.value = withTiming(target, { duration: 140 }, (finished) => {
        if (!finished) return;
        runOnJS(toggle)();
        translationY.value = 0;
      });
    });

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(translationY.value), [0, MAX_PULL_DISTANCE], [0.72, 1]),
    transform: [
      {
        scaleX: interpolate(Math.abs(translationY.value), [0, MAX_PULL_DISTANCE], [1, 1.5]),
      },
    ],
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translationY.value }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      onLayout={onLayout}
      style={[style, sheetStyle]}
    >
      <GestureDetector gesture={pan}>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityState={{ disabled: !canToggle, expanded }}
          accessibilityLabel={expanded ? (collapseHint ?? hint) : hint}
          accessibilityHint={expanded ? 'Потяните вниз или коснитесь' : 'Потяните вверх или коснитесь'}
          disabled={!canToggle}
          onPress={toggle}
          style={({ pressed }) => ({
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.x1,
            opacity: !canToggle ? 0.45 : pressed ? 0.68 : 1,
          })}
        >
          <Animated.View
            style={[
              {
                width: 40,
                height: 5,
                borderRadius: radius.pill,
                backgroundColor: canToggle ? colors.inkMuted : colors.surfaceSecondary,
              },
              barStyle,
            ]}
          />
          {canToggle && (
            <Text selectable={false} style={{ ...typography.micro, color: colors.inkMuted }}>
              {expanded ? 'Потяните вниз' : 'Потяните вверх'}
            </Text>
          )}
        </Pressable>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}
