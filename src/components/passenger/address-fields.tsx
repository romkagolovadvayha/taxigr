import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/app-icon';
import { hasHouseNumber } from '@/domain/address-precision';
import type { Address } from '@/domain/models';
import { colors, spacing, typography } from '@/theme/tokens';

type Props = {
  pickup: Address | null;
  destination: Address | null;
  onUseLocation?: () => void;
  locationLoading?: boolean;
  compact?: boolean;
};

function AddressRow({
  kind,
  label,
  address,
  compact,
  onUseLocation,
  locationLoading,
}: {
  kind: 'pickup' | 'destination';
  label: string;
  address: Address | null;
  compact: boolean;
  onUseLocation?: () => void;
  locationLoading?: boolean;
}) {
  const compactLocationAction = kind === 'pickup' && compact && !!onUseLocation;
  const needsHouseNumber = !!address && !hasHouseNumber(address);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${address?.label ?? 'не указано'}${needsHouseNumber ? ', требуется номер дома' : ''}`}
        onPress={() =>
          router.push({
            pathname: '/address-search',
            params: { field: kind, initialQuery: address?.label ?? '' },
          })
        }
        style={({ pressed }) => ({
          minHeight: compact ? 48 : 58,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.x4,
          paddingRight: compactLocationAction ? 56 : 0,
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
            {address?.label ??
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
        {!compactLocationAction && (
          <Text style={{ ...typography.sectionTitle, color: colors.inkMuted }}>›</Text>
        )}
      </Pressable>
      {compactLocationAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Использовать моё местоположение"
          accessibilityState={{ busy: locationLoading, disabled: locationLoading }}
          disabled={locationLoading}
          hitSlop={4}
          onPress={onUseLocation}
          style={({ pressed }) => ({
            position: 'absolute',
            right: 0,
            top: 4,
            width: 40,
            height: 40,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceSecondary,
            opacity: pressed || locationLoading ? 0.55 : 1,
          })}
        >
          <AppIcon name="recenter" size={20} color={colors.inkSecondary} />
        </Pressable>
      )}
    </View>
  );
}

export function AddressFields({
  pickup,
  destination,
  onUseLocation,
  locationLoading,
  compact = false,
}: Props) {
  return (
    <View>
      <AddressRow
        kind="pickup"
        label="Откуда"
        address={pickup}
        compact={compact}
        onUseLocation={onUseLocation}
        locationLoading={locationLoading}
      />
      {!!onUseLocation && !compact && (
        <Pressable
          accessibilityRole="button"
          disabled={locationLoading}
          onPress={onUseLocation}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginLeft: 26,
            marginBottom: compact ? spacing.x1 : spacing.x2,
            opacity: pressed || locationLoading ? 0.55 : 1,
          })}
        >
          <Text style={{ ...typography.caption, color: colors.info }}>
            {locationLoading ? 'Определяем геопозицию…' : 'Использовать моё местоположение'}
          </Text>
        </Pressable>
      )}
      <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 26 }} />
      <AddressRow kind="destination" label="Куда" address={destination} compact={compact} />
    </View>
  );
}
