# Shared UI components

## `src/components/legal/consent-checkbox.tsx` — ConsentCheckbox

Full-width legal-consent card shared by sign-in and driver application flows.
The 24 px continuous-corner checkbox uses the brand-yellow selected state with
a custom black SVG tick; unchecked state and document links use neutral theme
tokens. The entire 48 px minimum label row is tappable and exposes checkbox
semantics to assistive technology.

## `src/components/ui/app-button.tsx` — AppButton

Reusable primary, secondary, quiet, and destructive button.

```tsx
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Props = {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const backgrounds: Record<Variant, string> = {
  primary: colors.brand,
  secondary: colors.surfaceSecondary,
  quiet: colors.transparent,
  danger: colors.danger,
};
const foregrounds: Record<Variant, string> = {
  primary: colors.ink,
  secondary: colors.ink,
  quiet: colors.ink,
  danger: '#FFFFFF',
};

export function AppButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  accessibilityLabel,
}: Props) {
  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          minHeight: 56,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: spacing.x6,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: backgrounds[variant],
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.42 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foregrounds[variant]} />
      ) : (
        <Text style={{ ...typography.bodyStrong, color: foregrounds[variant] }}>{children}</Text>
      )}
    </Pressable>
  );
}
```

## `src/components/passenger/address-fields.tsx` — AddressFields

Two compact address rows with pickup/destination markers and current-location action.

```tsx
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { Address } from '@/domain/models';
import { colors, spacing, typography } from '@/theme/tokens';

type Props = {
  pickup: Address | null;
  destination: Address | null;
  onUseLocation?: () => void;
  locationLoading?: boolean;
};

function AddressRow({ kind, label, address }: {
  kind: 'pickup' | 'destination';
  label: string;
  address: Address | null;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${address?.label ?? 'не указано'}`}
      onPress={() => router.push({ pathname: '/address-search', params: { field: kind } })}
      style={({ pressed }) => ({
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x4,
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <View style={{
        width: 10,
        height: 10,
        borderRadius: kind === 'pickup' ? 999 : 2,
        backgroundColor: kind === 'pickup' ? colors.ink : colors.brand,
      }} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...typography.micro, color: colors.inkMuted, textTransform: 'uppercase' }}>
          {label}
        </Text>
        <Text numberOfLines={1} style={{
          ...typography.body,
          color: address ? colors.ink : colors.inkSecondary,
        }}>
          {address?.label ?? (kind === 'pickup' ? 'Укажите место подачи' : 'Куда поедем?')}
        </Text>
      </View>
      <Text style={{ ...typography.sectionTitle, color: colors.inkMuted }}>›</Text>
    </Pressable>
  );
}

export function AddressFields({ pickup, destination, onUseLocation, locationLoading }: Props) {
  return (
    <View>
      <AddressRow kind="pickup" label="Откуда" address={pickup} />
      {!!onUseLocation && (
        <Pressable
          accessibilityRole="button"
          disabled={locationLoading}
          onPress={onUseLocation}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginLeft: 26,
            marginBottom: spacing.x2,
            opacity: pressed || locationLoading ? 0.55 : 1,
          })}
        >
          <Text style={{ ...typography.caption, color: colors.info }}>
            {locationLoading ? 'Определяем геопозицию…' : 'Использовать моё местоположение'}
          </Text>
        </Pressable>
      )}
      <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 26 }} />
      <AddressRow kind="destination" label="Куда" address={destination} />
    </View>
  );
}
```

## `src/components/passenger/tariff-selector.tsx` — TariffSelector

Responsive row of selectable taxi tariff cards.

```tsx
import { Pressable, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/app-icon';
import { MoneyValue } from '@/components/ui/money-value';
import type { Tariff, TariffCode } from '@/domain/models';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  tariffs: Tariff[];
  selected: TariffCode;
  onSelect: (tariff: TariffCode) => void;
};

export function TariffSelector({ tariffs, selected, onSelect }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
      {tariffs.map((tariff) => {
        const active = tariff.code === selected;
        return (
          <Pressable
            key={tariff.code}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tariff.title}, ${tariff.etaMinutes} минут, ${tariff.priceMinor / 100} рублей`}
            onPress={() => onSelect(tariff.code)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              padding: spacing.x3,
              borderRadius: radius.card,
              borderCurve: 'continuous',
              borderWidth: active ? 2 : 1,
              borderColor: active ? colors.brand : colors.border,
              backgroundColor: active ? colors.canvas : colors.surface,
              opacity: pressed ? 0.78 : 1,
              gap: spacing.x1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppIcon name={tariff.code === 'child' ? 'child-seat' : 'car'} size={30} />
              <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                {tariff.etaMinutes} мин
              </Text>
            </View>
            <Text style={{ ...typography.bodyStrong, color: colors.ink }}>{tariff.title}</Text>
            <MoneyValue valueMinor={tariff.priceMinor} compact />
          </Pressable>
        );
      })}
    </View>
  );
}
```

## `src/components/ui/money-value.tsx` — MoneyValue

```tsx
import { Text } from 'react-native';
import { colors, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';

type Props = { valueMinor: number; compact?: boolean; color?: string };
export function MoneyValue({ valueMinor, compact = false, color = colors.ink }: Props) {
  return (
    <Text selectable style={{
      ...(compact ? typography.bodyStrong : typography.money),
      color,
      fontVariant: ['tabular-nums'],
    }}>
      {formatMoney(valueMinor)}
    </Text>
  );
}
```
