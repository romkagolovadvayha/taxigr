import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TariffIllustration } from '@/components/passenger/tariff-illustration';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { MoneyValue } from '@/components/ui/money-value';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import type { Tariff, TariffCode } from '@/domain/models';
import { useThemeColors } from '@/theme/theme-provider';
import { motion, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  tariffs: Tariff[];
  selected: TariffCode;
  onSelect: (tariff: TariffCode) => void;
  compact?: boolean;
  loading?: boolean;
  estimateAvailable: boolean;
};

const timing = { duration: motion.duration.standard, easing: Easing.bezier(...motion.easing.out), reduceMotion: ReduceMotion.System };

function TariffOption({ tariff, active, onSelect, compact, loading, estimateAvailable }: {
  tariff: Tariff;
  active: boolean;
} & Pick<Props, 'onSelect' | 'compact' | 'loading' | 'estimateAvailable'>) {
  const colors = useThemeColors();
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => { progress.value = withTiming(active ? 1 : 0, timing); }, [active, progress]);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -3 * progress.value }, { scale: 1 + 0.035 * progress.value }],
  }));
  return (
    <AnimatedPressable feedback="subtle" accessibilityRole="radio" aria-checked={active} aria-busy={loading}
      accessibilityLabel={loading
        ? `${tariff.title}, рассчитываем стоимость и время подачи`
        : estimateAvailable
          ? `${tariff.title}, ${tariff.etaMinutes} минут, ${tariff.priceMinor / 100} рублей${tariff.code === 'child' ? ', с креслом' : ''}`
          : `${tariff.title}${tariff.code === 'child' ? ', с креслом' : ''}`}
      onPress={() => onSelect(tariff.code)}
      style={{ flex: 1, minWidth: 0, alignItems: 'center', padding: spacing.x2, borderRadius: radius.md, gap: 2 }}>
      <Animated.View style={imageStyle}><TariffIllustration code={tariff.code} compact={compact} /></Animated.View>
      <Text selectable style={{ ...typography.bodyStrong, fontSize: compact ? 15 : 17, color: colors.ink, textAlign: 'center' }}>
        {tariff.title}
      </Text>
      {loading ? <SkeletonBlock width={84} height={17} /> : (
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
          {tariff.code === 'child'
            ? estimateAvailable ? `С креслом · ~ ${tariff.etaMinutes} мин` : 'С креслом'
            : estimateAvailable ? `Подача ~ ${tariff.etaMinutes} мин` : 'На каждый день'}
        </Text>
      )}
      {loading ? <SkeletonBlock width={56} height={22} /> : estimateAvailable ? <MoneyValue valueMinor={tariff.priceMinor} compact /> : null}
    </AnimatedPressable>
  );
}

export function TariffSelector({ tariffs, selected, onSelect, compact = false, loading = false, estimateAvailable }: Props) {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tariffs.findIndex((tariff) => tariff.code === selected));
  const position = useSharedValue(index);
  const optionWidth = Math.max(0, (width - 8) / Math.max(1, tariffs.length));
  useEffect(() => { position.value = withTiming(index, timing); }, [index, position]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * optionWidth }] }));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Тариф поездки"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', padding: 4, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary }}>
      {!!width && <Animated.View pointerEvents="none" style={[
        { position: 'absolute', top: 4, bottom: 4, left: 4, width: optionWidth, borderRadius: radius.md,
          backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brand },
        indicatorStyle,
      ]} />}
      {tariffs.map((tariff) => <TariffOption key={tariff.code} tariff={tariff} active={tariff.code === selected}
        onSelect={onSelect} compact={compact} loading={loading} estimateAvailable={estimateAvailable} />)}
    </View>
  );
}
