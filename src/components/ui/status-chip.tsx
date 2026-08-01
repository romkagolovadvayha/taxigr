import { Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type Props = {
  label: string;
  tone?: Tone;
};

export function StatusChip({ label, tone = 'neutral' }: Props) {
  const toneColors: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceSecondary, fg: colors.inkSecondary },
    success: { bg: colors.successSoft, fg: colors.successText },
    warning: { bg: colors.warningSoft, fg: colors.warningText },
    danger: { bg: colors.dangerSoft, fg: colors.dangerText },
    info: { bg: colors.infoSoft, fg: colors.infoText },
  };
  const palette = toneColors[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.x3,
        paddingVertical: spacing.x2,
        borderRadius: radius.pill,
        backgroundColor: palette.bg,
      }}
    >
      <Text selectable style={{ ...typography.caption, color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}
