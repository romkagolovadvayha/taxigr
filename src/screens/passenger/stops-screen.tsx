import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import type { Address } from '@/domain/models';
import { routeDestinationTitle } from '@/domain/route-label';
import { goBackOrReplace } from '@/navigation/back';
import { useRide } from '@/state/ride-provider';
import { colors, layout, opacity, radius, shadows, spacing, typography } from '@/theme/tokens';

type StopRowProps = {
  address: Address;
  index: number;
  count: number;
  onEdit: () => void;
  onRemove: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

function StopRow({
  address,
  index,
  count,
  onEdit,
  onRemove,
  onReorder,
}: StopRowProps) {
  const translationY = useSharedValue(0);
  const active = useSharedValue(false);
  const final = index === count - 1;

  const commitReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      onReorder(fromIndex, toIndex);
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [onReorder],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onStart(() => {
          active.set(true);
        })
        .onUpdate((event) => {
          translationY.set(event.translationY);
        })
        .onEnd((event) => {
          const offset = Math.round(event.translationY / layout.stopRowHeight);
          const targetIndex = Math.max(0, Math.min(count - 1, index + offset));
          translationY.set(
            withSpring(0, {
              duration: 400,
              dampingRatio: 0.8,
              velocity: event.velocityY,
              reduceMotion: ReduceMotion.System,
            }),
          );
          active.set(false);
          if (targetIndex !== index) scheduleOnRN(commitReorder, index, targetIndex);
        })
        .onFinalize(() => {
          active.set(false);
        }),
    [active, commitReorder, count, index, translationY],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    zIndex: active.get() ? 2 : 0,
    opacity: active.get() ? opacity.pressedSubtle : opacity.visible,
    transform: [{ translateY: translationY.get() }],
  }));

  const move = (direction: -1 | 1) => {
    const targetIndex = Math.max(0, Math.min(count - 1, index + direction));
    if (targetIndex !== index) commitReorder(index, targetIndex);
  };

  return (
    <Animated.View
      style={[
        {
          minHeight: layout.stopRowHeight,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.x2,
          paddingVertical: spacing.x2,
          paddingHorizontal: spacing.x3,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          ...shadows.subtle,
        },
        animatedStyle,
      ]}
    >
      <View
        accessibilityLabel={final ? 'Конечная точка' : `Остановка ${index + 1} из ${count}`}
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        {final ? (
          <AppIcon name="flag" size={18} color={colors.ink} />
        ) : (
          <Text selectable style={{ ...typography.caption, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {index + 1}
          </Text>
        )}
      </View>
      <AnimatedPressable
        feedback="subtle"
        accessibilityRole="button"
        accessibilityLabel={`Изменить остановку ${index + 1}: ${address.label}`}
        onPress={onEdit}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 48,
          justifyContent: 'center',
          opacity: pressed ? opacity.pressed : opacity.visible,
        })}
      >
        <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
          {routeDestinationTitle(index, count)}
        </Text>
        <Text selectable numberOfLines={2} style={{ ...typography.body, color: colors.ink }}>
          {address.label}
        </Text>
        {!!address.details && (
          <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {address.details}
          </Text>
        )}
      </AnimatedPressable>
      <IconButton
        icon="close"
        label={`Удалить остановку ${index + 1}`}
        size={44}
        onPress={onRemove}
      />
      <GestureDetector gesture={pan}>
        <AnimatedPressable
          accessibilityRole="adjustable"
          accessibilityLabel={`Порядок остановки ${index + 1}: ${address.label}`}
          accessibilityHint="Перетаскивайте вверх или вниз. С VoiceOver используйте жесты изменения значения."
          accessibilityValue={{ min: 1, max: count, now: index + 1 }}
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={index + 1}
          aria-valuetext={`Позиция ${index + 1} из ${count}`}
          accessibilityActions={[
            { name: 'decrement', label: 'Переместить выше' },
            { name: 'increment', label: 'Переместить ниже' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'decrement') move(-1);
            if (event.nativeEvent.actionName === 'increment') move(1);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            }
            if (event.nativeEvent.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            }
          }}
          style={{
            width: 44,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.md,
          }}
        >
          <AppIcon name="drag" size={24} color={colors.inkMuted} />
        </AnimatedPressable>
      </GestureDetector>
    </Animated.View>
  );
}

export function StopsScreen() {
  const { destinations, removeDestination, reorderDestinations } = useRide();
  const canAdd = destinations.length < 5;

  return (
    <Screen contentStyle={{ maxWidth: 640, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="close" label="Закрыть остановки" onPress={() => goBackOrReplace('/')} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Остановки
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Перетащите точки в нужном порядке. Маршрут и цена обновятся автоматически
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.x2 }} accessibilityRole="list">
        {destinations.map((address, index) => (
          <StopRow
            key={`${address.id}:${index}`}
            address={address}
            index={index}
            count={destinations.length}
            onEdit={() =>
              router.push({
                pathname: '/address-search',
                params: {
                  field: 'destination',
                  destinationIndex: String(index),
                  initialQuery: address.label,
                },
              })
            }
            onRemove={() => removeDestination(index)}
            onReorder={reorderDestinations}
          />
        ))}
      </View>

      {!destinations.length && (
        <View
          accessibilityRole="alert"
          style={{
            alignItems: 'center',
            gap: spacing.x3,
            padding: spacing.x6,
            borderRadius: radius.card,
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <AppIcon name="location" size={28} color={colors.inkSecondary} />
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
            Добавьте хотя бы одну точку назначения
          </Text>
        </View>
      )}

      <AppButton
        disabled={!canAdd}
        icon={<AppIcon name="plus" size={22} color={canAdd ? colors.brandInk : colors.inkMuted} />}
        onPress={() =>
          router.push({ pathname: '/address-search', params: { field: 'destination', append: '1' } })
        }
      >
        {canAdd ? 'Добавить остановку' : 'Можно добавить не больше 5 точек'}
      </AppButton>
    </Screen>
  );
}
