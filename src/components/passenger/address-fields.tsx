import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import {
  isDestinationAddressComplete,
  isPickupAddressComplete,
} from '@/domain/address-precision';
import type { Address } from '@/domain/models';
import {
  formatRoutePointCount,
  routeDestinationTitle,
} from '@/domain/route-label';
import { componentSizing, layout, radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  pickup: Address | null;
  destinations?: Address[];
  destination: Address | null;
  onUseLocation?: () => void;
  locationLoading?: boolean;
  compact?: boolean;
  reducedActions?: boolean;
  hideAddDestination?: boolean;
  validationAttempt?: number;
};

const addressActionSizing = componentSizing.addressFieldAction;

function AddressActionVisual({
  icon,
  iconSize,
  color,
  reduced,
}: {
  icon: AppIconName;
  iconSize: number;
  color: string;
  reduced: boolean;
}) {
  const colors = useThemeColors();
  const scale = reduced ? addressActionSizing.visualScale : 1;
  const visualSize = addressActionSizing.touchTarget * scale;

  return (
    <View
      pointerEvents="none"
      style={{
        width: visualSize,
        height: visualSize,
        borderRadius: visualSize / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      <AppIcon
        name={icon}
        size={iconSize * scale}
        color={color}
      />
    </View>
  );
}

function AddressRow({
  kind,
  label,
  address,
  compact,
  onUseLocation,
  locationLoading,
  destinations,
  onAddDestination,
  reducedActions,
  validationAttempt,
}: {
  kind: 'pickup' | 'destination';
  label: string;
  address: Address | null;
  compact: boolean;
  onUseLocation?: () => void;
  locationLoading?: boolean;
  destinations?: Address[];
  onAddDestination?: () => void;
  reducedActions: boolean;
  validationAttempt: number;
}) {
  const colors = useThemeColors();
  const compactLocationAction = kind === 'pickup' && compact && !!onUseLocation;
  const addDestinationAction = kind === 'destination' && !!address && !!onAddDestination;
  const routeDestinations = destinations ?? [];
  const multipleDestinations =
    kind === 'destination' && routeDestinations.length > 1;
  const needsAddressDetails = kind === 'destination' && destinations?.length
    ? destinations.some((item) => !isDestinationAddressComplete(item))
    : !!address && (
        kind === 'pickup'
          ? !isPickupAddressComplete(address)
          : !isDestinationAddressComplete(address)
      );
  const invalid = validationAttempt > 0 && (!address || !!needsAddressDetails);
  const shake = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(shake);
    shake.value = 0;
    if (invalid && !reduceMotion) {
      shake.value = withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 70 }),
        withTiming(-5, { duration: 70 }),
        withTiming(5, { duration: 70 }),
        withTiming(0, { duration: 70 }),
      );
    }
    return () => cancelAnimation(shake);
  }, [invalid, reduceMotion, shake, validationAttempt]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  return (
    <Animated.View style={[{ position: 'relative' }, shakeStyle]}>
      <AnimatedPressable
        feedback="subtle"
        accessibilityRole="button"
        accessibilityLabel={`${
          multipleDestinations
            ? `Маршрут: ${routeDestinations
                .map((item, index) => `${routeDestinationTitle(index, routeDestinations.length)}: ${item.label}`)
                .join('; ')}`
            : `${label}: ${address?.label ?? (kind === 'pickup' ? 'Где вы?' : 'не указано')}`
        }${invalid ? ', укажите точный адрес' : needsAddressDetails ? ', требуется уточнить адрес' : ''}`}
        onPress={() => {
          if (kind === 'destination' && address) {
            router.push('/stops' as never);
            return;
          }
          router.push({
            pathname: '/address-search',
            params: { field: kind, initialQuery: address?.label ?? '' },
          });
        }}
        style={({ pressed }) => ({
          minHeight: compact ? 56 : 64,
          flexDirection: 'row',
          alignItems: multipleDestinations ? 'flex-start' : 'center',
          gap: spacing.x3,
          paddingVertical: multipleDestinations ? spacing.x3 : 0,
          paddingRight: compactLocationAction || addDestinationAction ? 56 : 0,
          opacity: pressed ? 0.68 : 1,
        })}
      >
        {!multipleDestinations && (
          <View
            style={{
              width: 10,
              height: 10,
              marginHorizontal: 4,
              borderRadius: kind === 'pickup' ? 999 : 3,
              borderWidth: kind === 'pickup' ? 2 : 0,
              borderColor: invalid ? colors.danger : colors.brand,
              backgroundColor: kind === 'pickup' ? colors.transparent : invalid ? colors.danger : colors.brand,
            }}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text selectable style={{ ...typography.micro, fontSize: 11, color: invalid ? colors.dangerText : colors.inkSecondary }}>
            {multipleDestinations
              ? `Маршрут · ${formatRoutePointCount(routeDestinations.length)}`
              : label}
          </Text>
          {multipleDestinations ? (
            <View style={{ gap: spacing.x2, marginTop: spacing.x2 }}>
              {routeDestinations.map((item, index) => {
                const final = index === routeDestinations.length - 1;
                return (
                  <View
                    key={`${item.id}:${index}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: radius.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: final ? colors.ink : colors.surfaceSecondary,
                      }}
                    >
                      {final ? (
                        <AppIcon name="flag" size={15} color={colors.surface} />
                      ) : (
                        <Text
                          selectable
                          style={{
                            ...typography.caption,
                            color: colors.ink,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {index + 1}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
                        {routeDestinationTitle(index, routeDestinations.length)}
                      </Text>
                      <Text
                        selectable
                        numberOfLines={1}
                        style={{ ...typography.body, color: colors.ink }}
                      >
                        {item.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text
              selectable
              numberOfLines={1}
              style={{ ...typography.bodyStrong, fontSize: compact ? 15 : 16, color: invalid ? colors.dangerText : colors.ink }}
            >
              {address?.label ??
                (kind === 'pickup'
                  ? locationLoading
                    ? 'Определяем местоположение…'
                    : 'Где вы?'
                  : 'Куда поедем?')}
            </Text>
          )}
          {(invalid || needsAddressDetails) && (
            <Text accessibilityRole={invalid ? 'alert' : undefined} selectable style={{ ...typography.micro, color: invalid ? colors.dangerText : colors.warningText }}>
              {address ? 'Уточните адрес' : kind === 'pickup' ? 'Укажите, откуда вас забрать' : 'Укажите, куда поедем'}
            </Text>
          )}
        </View>
        {!compactLocationAction && !addDestinationAction ? (
          <Text style={{ ...typography.sectionTitle, color: colors.inkMuted, alignSelf: 'center' }}>›</Text>
        ) : null}
      </AnimatedPressable>
      {addDestinationAction && (
        <AnimatedPressable
          feedback="subtle"
          accessibilityRole="button"
          accessibilityLabel="Добавить ещё одну точку назначения"
          hitSlop={2}
          onPress={onAddDestination}
          style={({ pressed }) => ({
            position: 'absolute',
            right: -2,
            ...(reducedActions
              ? { bottom: layout.fullInset }
              : { top: addressActionSizing.rowTopInset }),
            width: addressActionSizing.touchTarget,
            height: addressActionSizing.touchTarget,
            alignItems: 'center',
            justifyContent: reducedActions ? 'flex-end' : 'center',
            opacity: pressed ? 0.68 : 1,
          })}
        >
          <AddressActionVisual
            icon="plus"
            iconSize={addressActionSizing.addIcon}
            color={colors.ink}
            reduced={reducedActions}
          />
        </AnimatedPressable>
      )}
      {compactLocationAction && (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Использовать моё местоположение"
          aria-busy={locationLoading}
          aria-disabled={locationLoading}
          disabled={locationLoading}
          hitSlop={2}
          onPress={onUseLocation}
          style={({ pressed }) => ({
            position: 'absolute',
            right: -2,
            ...(reducedActions
              ? { bottom: layout.fullInset }
              : { top: addressActionSizing.rowTopInset }),
            width: addressActionSizing.touchTarget,
            height: addressActionSizing.touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || locationLoading ? 0.55 : 1,
          })}
        >
          <AddressActionVisual
            icon="recenter"
            iconSize={addressActionSizing.locationIcon}
            color={colors.inkSecondary}
            reduced={reducedActions}
          />
        </AnimatedPressable>
      )}
    </Animated.View>
  );
}

export function AddressFields({
  pickup,
  destinations,
  destination,
  onUseLocation,
  locationLoading,
  compact = false,
  reducedActions = false,
  hideAddDestination = false,
  validationAttempt = 0,
}: Props) {
  const colors = useThemeColors();
  return (
    <View>
      <AddressRow
        kind="pickup"
        label="Откуда"
        address={pickup}
        compact={compact}
        onUseLocation={onUseLocation}
        locationLoading={locationLoading}
        reducedActions={reducedActions}
        validationAttempt={validationAttempt}
      />
      {!!onUseLocation && !compact && (
        <AnimatedPressable
          feedback="subtle"
          accessibilityRole="button"
          accessibilityLabel="Использовать моё местоположение"
          aria-busy={locationLoading}
          aria-disabled={locationLoading}
          disabled={locationLoading}
          onPress={onUseLocation}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            minHeight: 44,
            justifyContent: 'center',
            marginLeft: 26,
            marginBottom: compact ? spacing.x1 : spacing.x2,
            opacity: pressed || locationLoading ? 0.55 : 1,
          })}
        >
          <Text style={{ ...typography.caption, color: colors.infoText }}>
            {locationLoading ? 'Определяем геопозицию…' : 'Использовать моё местоположение'}
          </Text>
        </AnimatedPressable>
      )}
      <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 30 }} />
      <AddressRow
        kind="destination"
        label="Куда"
        address={destination}
        destinations={destinations}
        compact={compact}
        onAddDestination={
          !hideAddDestination && (destinations?.length ?? 0) < 5
            ? () => router.push({ pathname: '/address-search', params: { field: 'destination', append: '1' } })
            : undefined
        }
        reducedActions={reducedActions}
        validationAttempt={validationAttempt}
      />
    </View>
  );
}
