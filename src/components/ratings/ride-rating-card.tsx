import { useState } from 'react';
import { Text, View } from 'react-native';

import { RatingBadge } from '@/components/ratings/rating-badge';
import { StarRating } from '@/components/ratings/star-rating';
import { AppButton } from '@/components/ui/app-button';
import { colors, spacing, typography } from '@/theme/tokens';

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
  const [score, setScore] = useState(submittedScore ?? 0);

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
        <AppButton onPress={onContinue}>Новая поездка</AppButton>
      </View>
    );
  }

  return (
    <View
      style={{
        gap: spacing.x3,
        paddingTop: spacing.x4,
        borderTopWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
      }}
    >
      <View style={{ alignItems: 'center', gap: spacing.x2 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          {participantRole === 'driver' ? 'Оцените водителя' : 'Оцените пассажира'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <Text selectable style={{ ...typography.caption, color: colors.ink }}>
            {participantName}
          </Text>
          <RatingBadge
            rating={participantRating}
            count={participantRatingCount}
            compact
          />
        </View>
      </View>
      <StarRating value={score} onChange={setScore} disabled={loading} />
      <View style={{ width: '100%', gap: spacing.x1 }}>
        <AppButton
          disabled={score === 0}
          loading={loading}
          onPress={() => void onSubmit(score)}
        >
          Отправить оценку
        </AppButton>
        <AppButton variant="quiet" disabled={loading} onPress={onContinue}>
          Не сейчас
        </AppButton>
      </View>
    </View>
  );
}
