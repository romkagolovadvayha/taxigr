import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TariffIllustration } from '@/components/passenger/tariff-illustration';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { MoneyValue } from '@/components/ui/money-value';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import type { Tariff, TariffCode } from '@/domain/models';
import { getTariffPromotionText } from '@/domain/first-order-discount';
import { useThemeColors } from '@/theme/theme-provider';
import { motion, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  scheduled?: boolean;
  tariffs: Tariff[];
  selected: TariffCode;
  onSelect: (tariff: TariffCode) => void;
  compact?: boolean;
  dense?: boolean;
  showIllustrations?: boolean;
  loading?: boolean;
  estimateAvailable: boolean;
};

const timing = { duration: motion.duration.standard, easing: Easing.bezier(...motion.easing.out), reduceMotion: ReduceMotion.System };

function TariffOption({ tariff, active, onSelect, compact, dense, showIllustrations, loading, estimateAvailable, scheduled }: {
  tariff: Tariff;
  active: boolean;
} & Pick<Props, 'onSelect' | 'compact' | 'dense' | 'showIllustrations' | 'loading' | 'estimateAvailable' | 'scheduled'>) {
  const colors = useThemeColors();
  const inline = compact && showIllustrations;
  const promotionText = getTariffPromotionText(tariff);
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
          ? `${tariff.title}, ${scheduled ? 'ко времени' : `${tariff.etaMinutes} минут`}, ${tariff.priceMinor / 100} рублей${tariff.code === 'child' ? ', поездка с ребёнком' : ''}${promotionText ? `, ${promotionText}` : ''}`
          : `${tariff.title}${tariff.code === 'child' ? ', поездка с ребёнком' : ''}`}
      onPress={() => onSelect(tariff.code)}
      style={{ flex: 1, minWidth: 0, flexDirection: inline ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', padding: spacing.x2,
        minHeight: dense ? 56 : inline || !showIllustrations ? 64 : undefined, borderRadius: radius.md, gap: inline ? 6 : 2 }}>
      {active && !inline && <View pointerEvents="none" style={{ position: 'absolute', right: 8, top: 8, width: 17, height: 17,
        borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }}>
        <AppIcon name="check" size={12} color={colors.brandInk} />
      </View>}
      {showIllustrations && <View style={{ flexShrink: 0 }}>
        <Animated.View style={imageStyle}><TariffIllustration code={tariff.code} compact={compact} inline={inline} /></Animated.View>
        {active && inline && <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14,
          borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }}>
          <AppIcon name="check" size={10} color={colors.brandInk} />
        </View>}
      </View>}
      <View style={{ flex: inline ? 1 : undefined, width: inline ? undefined : '100%', minWidth: 0, alignItems: inline ? 'flex-start' : 'center', gap: 2 }}>
        <Text selectable style={{ ...typography.bodyStrong, fontSize: compact ? 14 : 16, lineHeight: 20, color: colors.ink, textAlign: inline ? 'left' : 'center' }}>
          {tariff.title}
        </Text>
        {loading ? <SkeletonBlock width={inline ? '100%' : 84} height={17} /> : (
          <Text selectable numberOfLines={dense ? 1 : undefined} style={{ ...typography.caption, maxWidth: '100%', fontSize: compact ? 12 : 13, lineHeight: 17, color: colors.inkSecondary, textAlign: inline ? 'left' : 'center' }}>
            {tariff.code === 'child'
              ? estimateAvailable && !scheduled && !dense ? `С ребёнком · ~ ${tariff.etaMinutes} мин` : 'С ребёнком'
              : estimateAvailable && !scheduled ? `Подача ~ ${tariff.etaMinutes} мин` : 'На каждый день'}
          </Text>
        )}
        {!loading && estimateAvailable && !!promotionText && (
          <Text selectable testID={`tariff-promotion-${tariff.code}`} numberOfLines={dense ? 1 : compact ? 2 : undefined}
            style={{ ...typography.caption, maxWidth: '100%', color: colors.ink, textAlign: inline ? 'left' : 'center' }}>{promotionText}</Text>
        )}
        {!compact && !loading && estimateAvailable && tariff.originalPriceMinor !== undefined && (
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textDecorationLine: 'line-through' }}>{tariff.originalPriceMinor / 100} ₽</Text>
        )}
        {!compact && (loading ? <SkeletonBlock width={56} height={22} /> : estimateAvailable ? <MoneyValue valueMinor={tariff.priceMinor} compact /> : null)}
      </View>
    </AnimatedPressable>
  );
}

export function TariffSelector({ tariffs, selected, onSelect, compact = false, dense = false, showIllustrations = true, loading = false, estimateAvailable, scheduled }: Props) {
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
          backgroundColor: colors.surface },
        indicatorStyle,
      ]} />}
      {tariffs.map((tariff) => <TariffOption key={tariff.code} tariff={tariff} active={tariff.code === selected}
        onSelect={onSelect} compact={compact} dense={dense} showIllustrations={showIllustrations} loading={loading} estimateAvailable={estimateAvailable} scheduled={scheduled} />)}
    </View>
  );
}
