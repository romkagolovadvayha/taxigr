import { Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/app-icon';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  rating: number;
  count?: number;
  compact?: boolean;
};

function formatRating(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '5,00';
}

export function RatingBadge({ rating, count, compact = false }: Props) {
  const countLabel = count != null && count > 0 ? `, ${count} оценок` : '';
  return (
    <View
      accessibilityLabel={`Рейтинг ${formatRating(rating)} из 5${countLabel}`}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x1,
        paddingHorizontal: compact ? 6 : spacing.x2,
        paddingVertical: compact ? 3 : spacing.x1,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      <AppIcon name="star" size={compact ? 12 : 14} color={colors.brandPressed} filled />
      <Text
        style={{
          ...typography.micro,
          color: colors.ink,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatRating(rating)}
      </Text>
    </View>
  );
}
