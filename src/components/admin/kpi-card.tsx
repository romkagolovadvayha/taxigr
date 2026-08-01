import { Text, View } from 'react-native';

import type { AppIconName } from '@/components/ui/app-icon';
import { AppIcon } from '@/components/ui/app-icon';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  hint: string;
  icon: AppIconName;
};

export function KpiCard({ label, value, hint, icon }: Props) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 220,
        minHeight: 150,
        padding: spacing.x5,
        gap: spacing.x3,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name={icon} />
      </View>
      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
      <Text selectable style={{ ...typography.pageTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>{hint}</Text>
    </View>
  );
}

