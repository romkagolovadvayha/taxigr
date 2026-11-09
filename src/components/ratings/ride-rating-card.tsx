import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { RatingBadge } from '@/components/ratings/rating-badge';
import { StarRating } from '@/components/ratings/star-rating';
import { AppButton } from '@/components/ui/app-button';
import { spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  participantRole: 'driver' | 'passenger';
  participantName: string;
  participantRating: number;
  participantRatingCount?: number;
  submittedScore?: number;
  loading?: boolean;
  onSubmit: (score: number) => Promise<void>;
  onContinue: () => void;
};

export function RideRatingCard({
  participantRole,
  participantName,
  participantRating,
  participantRatingCount,
  submittedScore,
  loading = false,
  onSubmit,
  onContinue,
}: Props) {
  const colors = useThemeColors();
  const [score, setScore] = useState(submittedScore ?? 0);

  // Close only after the server (or a recovered socket update) confirms the
  // score. A failed save must leave the selected stars available for retry.
  useEffect(() => {
    if (submittedScore && !loading) onContinue();
  }, [submittedScore, loading, onContinue]);

  if (submittedScore) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{
          gap: spacing.x3,
          paddingTop: spacing.x4,
          borderTopWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        }}
      >
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          Спасибо за оценку
        </Text>
        <StarRating value={submittedScore} disabled size={26} />
      </View>
    );
  }

  return (
    <View
      style={{
        gap: spacing.x2,
        paddingTop: spacing.x2,
        borderTopWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
      }}
    >
      <View style={{ width: '100%', alignItems: 'center', gap: spacing.x1 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          {participantRole === 'driver' ? 'Оцените водителя' : 'Оцените пассажира'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.x2, width: '100%' }}>
          <Text selectable numberOfLines={1} style={{ ...typography.caption, flexShrink: 1, color: colors.ink }}>
            {participantName}
          </Text>
          <RatingBadge
            rating={participantRating}
            count={participantRatingCount}
            compact
          />
        </View>
      </View>
      <StarRating value={score} onChange={setScore} disabled={loading} size={26} />
      <View style={{ width: '100%', flexDirection: 'row', gap: spacing.x1 }}>
        <AppButton
          compact
          fullWidth={false}
          style={{ flex: 1.5, minWidth: 0 }}
          disabled={score === 0}
          loading={loading}
          accessibilityLabel="Отправить оценку"
          onPress={() => void onSubmit(score)}
        >
          Оценить
        </AppButton>
        <AppButton compact fullWidth={false} style={{ flex: 1, minWidth: 0 }} variant="quiet" disabled={loading} onPress={onContinue}>
          Не сейчас
        </AppButton>
      </View>
    </View>
  );
}
