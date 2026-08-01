import { Pressable, Text, View } from 'react-native';

import { TariffIllustration } from '@/components/passenger/tariff-illustration';
import { MoneyValue } from '@/components/ui/money-value';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import type { Tariff, TariffCode } from '@/domain/models';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  tariffs: Tariff[];
  selected: TariffCode;
  onSelect: (tariff: TariffCode) => void;
  compact?: boolean;
  loading?: boolean;
};

export function TariffSelector({
  tariffs,
  selected,
  onSelect,
  compact = false,
  loading = false,
}: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
      {tariffs.map((tariff) => {
        const active = tariff.code === selected;
        return (
          <Pressable
            key={tariff.code}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, busy: loading }}
            accessibilityLabel={
              loading
                ? `${tariff.title}, рассчитываем стоимость и время подачи`
                : `${tariff.title}, ${tariff.etaMinutes} минут, ${tariff.priceMinor / 100} рублей`
            }
            onPress={() => onSelect(tariff.code)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              height: compact ? 78 : undefined,
              padding: compact ? spacing.x2_5 : spacing.x3,
              borderRadius: compact ? radius.lg : radius.card,
              borderCurve: 'continuous',
              borderWidth: active ? 2 : 1,
              borderColor: active ? colors.brand : colors.border,
              backgroundColor: active ? colors.canvas : colors.surface,
              opacity: pressed ? 0.78 : 1,
              gap: compact ? 0 : spacing.x1,
              justifyContent: compact ? 'space-between' : undefined,
              position: 'relative',
              overflow: 'hidden',
            })}
          >
            {compact && <TariffIllustration code={tariff.code} compact />}
            <View
              style={{
                height: compact ? 28 : undefined,
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
              }}
            >
              {!compact && <TariffIllustration code={tariff.code} />}
              {compact && <View />}
              {loading ? (
                <SkeletonBlock width={38} height={14} />
              ) : (
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                  {tariff.etaMinutes} мин
                </Text>
              )}
            </View>
            {compact ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {tariff.title}
                </Text>
                {loading ? (
                  <SkeletonBlock width={56} height={18} />
                ) : (
                  <MoneyValue valueMinor={tariff.priceMinor} compact />
                )}
              </View>
            ) : (
              <>
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {tariff.title}
                </Text>
                {loading ? (
                  <SkeletonBlock width={56} height={18} />
                ) : (
                  <MoneyValue valueMinor={tariff.priceMinor} compact />
                )}
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
