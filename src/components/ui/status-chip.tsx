import { Text, View } from 'react-native';

import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type Props = {
  label: string;
  tone?: Tone;
  compact?: boolean;
};

export function StatusChip({ label, tone = 'neutral', compact = false }: Props) {
  const colors = useThemeColors();
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
        paddingHorizontal: compact ? spacing.x2 : spacing.x3,
        paddingVertical: compact ? 2 : spacing.x2,
        borderRadius: radius.pill,
        backgroundColor: palette.bg,
      }}
    >
      <Text selectable style={{ ...(compact ? typography.micro : typography.caption), color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}
