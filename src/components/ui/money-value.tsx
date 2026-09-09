import { Text } from 'react-native';

import { typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  valueMinor: number;
  compact?: boolean;
  color?: string;
};

export function MoneyValue({ valueMinor, compact = false, color: customColor }: Props) {
  const colors = useThemeColors();
  const color = customColor ?? colors.ink;
  return (
    <Text
      selectable
      style={{
        ...(compact ? typography.bodyStrong : typography.money),
        color,
        fontVariant: ['tabular-nums'],
      }}
    >
      {formatMoney(valueMinor)}
    </Text>
  );
}

