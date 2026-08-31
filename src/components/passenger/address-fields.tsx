import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { hasHouseNumber } from '@/domain/address-precision';
import type { Address } from '@/domain/models';
import { colors, componentSizing, layout, spacing, typography } from '@/theme/tokens';

type Props = {
  pickup: Address | null;
  destinations?: Address[];
  destination: Address | null;
  onUseLocation?: () => void;
  locationLoading?: boolean;
  compact?: boolean;
  reducedActions?: boolean;
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
}) {
  const compactLocationAction = kind === 'pickup' && compact && !!onUseLocation;
  const addDestinationAction = kind === 'destination' && !!address && !!onAddDestination;
  const needsHouseNumber = kind === 'destination' && destinations?.length
    ? destinations.some((item) => !hasHouseNumber(item))
    : !!address && !hasHouseNumber(address);
  return (
    <View style={{ position: 'relative' }}>
      <AnimatedPressable
        feedback="subtle"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${address?.label ?? 'не указано'}${needsHouseNumber ? ', требуется номер дома' : ''}`}
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
          minHeight: compact ? 48 : 58,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.x4,
          paddingRight: compactLocationAction || addDestinationAction ? 56 : 0,
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: kind === 'pickup' ? 999 : 2,
            backgroundColor: kind === 'pickup' ? colors.ink : colors.brand,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted, textTransform: 'uppercase' }}>
            {label}
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{ ...typography.body, color: address ? colors.ink : colors.inkSecondary }}
          >
            {kind === 'destination' && destinations && destinations.length > 1
              ? destinations.map((item) => item.label).join(' → ')
              : address?.label ??
              (kind === 'pickup'
                ? locationLoading
                  ? 'Определяем местоположение…'
                  : 'Моё местоположение'
                : 'Куда поедем?')}
          </Text>
          {needsHouseNumber && (
            <Text selectable style={{ ...typography.micro, color: colors.warningText }}>
              Укажите номер дома
            </Text>
          )}
        </View>
        {!compactLocationAction && !addDestinationAction ? (
          <Text style={{ ...typography.sectionTitle, color: colors.inkMuted }}>›</Text>
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
    </View>
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
}: Props) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      router.prefetch('/address-search');
      router.prefetch('/stops' as never);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

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
          <Text style={{ ...typography.caption, color: colors.info }}>
            {locationLoading ? 'Определяем геопозицию…' : 'Использовать моё местоположение'}
          </Text>
        </AnimatedPressable>
      )}
      <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 26 }} />
      <AddressRow
        kind="destination"
        label="Куда"
        address={destination}
        destinations={destinations}
        compact={compact}
        onAddDestination={
          (destinations?.length ?? 0) < 5
            ? () => router.push({ pathname: '/address-search', params: { field: 'destination', append: '1' } })
            : undefined
        }
        reducedActions={reducedActions}
      />
    </View>
  );
}
