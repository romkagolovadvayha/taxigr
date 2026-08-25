import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import {
  inferVehicleColorHex,
  normalizeVehicleColorHex,
  vehicleColorOptions,
} from '@/domain/vehicle-colors';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  name: string;
  hex: string;
  onChange: (value: { name: string; hex: string }) => void;
  label?: string;
};

export function VehicleColorPicker({
  name,
  hex,
  onChange,
  label = 'Цвет автомобиля',
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const selectedPopular = useMemo(
    () =>
      vehicleColorOptions.some(
        (option) =>
          option.name.toLocaleLowerCase('ru-RU') === name.trim().toLocaleLowerCase('ru-RU'),
      ),
    [name],
  );
  const customSelected = Boolean(name.trim()) && !selectedPopular;
  const [customMode, setCustomMode] = useState(customSelected);

  return (
    <View style={{ gap: spacing.x2 }}>
      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
        {label}
      </Text>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${name || 'не выбран'}`}
        aria-expanded={expanded}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => ({
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.x3,
          paddingHorizontal: spacing.x4,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: expanded ? colors.brand : colors.border,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.pill,
            backgroundColor: name ? normalizeVehicleColorHex(hex) : colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.borderStrong,
          }}
        />
        <Text
          selectable
          style={{
            ...typography.body,
            color: name ? colors.ink : colors.inkSecondary,
            flex: 1,
          }}
        >
          {name || 'Выберите цвет'}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <AppIcon name="chevron" size={20} color={colors.inkMuted} />
        </View>
      </AnimatedPressable>

      {expanded && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={{
            padding: spacing.x3,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.x2,
          }}
        >
          {vehicleColorOptions.map((option) => {
            const selected =
              option.name.toLocaleLowerCase('ru-RU') === name.trim().toLocaleLowerCase('ru-RU');
            return (
              <AnimatedPressable
                key={option.key}
                accessibilityRole="radio"
                aria-checked={selected}
                accessibilityLabel={option.name}
                onPress={() => {
                  onChange({ name: option.name, hex: option.hex });
                  setCustomMode(false);
                  setExpanded(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexBasis: '47%',
                  flexGrow: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.x2,
                  paddingHorizontal: spacing.x3,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.brandSoft : colors.canvas,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.brand : colors.border,
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: radius.pill,
                    backgroundColor: option.hex,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                  }}
                />
                <Text selectable style={{ ...typography.caption, color: colors.ink, flex: 1 }}>
                  {option.name}
                </Text>
              </AnimatedPressable>
            );
          })}
          <AnimatedPressable
            accessibilityRole="radio"
            aria-checked={customSelected || customMode}
            accessibilityLabel="Другой цвет"
            onPress={() => {
              setCustomMode(true);
              if (!customSelected) onChange({ name: '', hex: normalizeVehicleColorHex(hex) });
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.x2,
              paddingHorizontal: spacing.x3,
              borderRadius: radius.md,
              backgroundColor: customSelected || customMode ? colors.brandSoft : colors.canvas,
              borderWidth: customSelected || customMode ? 2 : 1,
              borderColor: customSelected || customMode ? colors.brand : colors.border,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: radius.pill,
                backgroundColor: normalizeVehicleColorHex(hex),
                borderWidth: 1,
                borderColor: colors.borderStrong,
              }}
            />
            <Text selectable style={{ ...typography.caption, color: colors.ink }}>
              Другой цвет
            </Text>
          </AnimatedPressable>
          {customMode && (
            <View style={{ width: '100%', gap: spacing.x2 }}>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                Напишите цвет как в документах
              </Text>
              <TextInput
                autoFocus
                value={customSelected ? name : ''}
                accessibilityLabel="Другой цвет автомобиля"
                placeholder="Например: мокрый асфальт"
                placeholderTextColor={colors.inkMuted}
                onChangeText={(value) => onChange({ name: value, hex: inferVehicleColorHex(value) })}
                style={{
                  ...typography.body,
                  minHeight: 52,
                  paddingHorizontal: spacing.x4,
                  borderRadius: radius.md,
                  backgroundColor: colors.canvas,
                  color: colors.ink,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
