import { Text, View } from 'react-native';

import type { AppIconName } from '@/components/ui/app-icon';
import { AppIcon } from '@/components/ui/app-icon';
import { spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  label: string;
  value: string;
  hint: string;
  icon: AppIconName;
};

export function KpiCard({ label, value, hint, icon }: Props) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 190,
        minHeight: 136,
        padding: spacing.x4,
        gap: spacing.x2,
        backgroundColor: colors.surface,
        borderLeftWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.x2,
          alignItems: 'center',
        }}
      >
        <AppIcon name={icon} size={17} color={colors.inkSecondary} />
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
      </View>
      <Text selectable style={{ ...typography.display, fontSize: 32, color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>{hint}</Text>
    </View>
  );
}
