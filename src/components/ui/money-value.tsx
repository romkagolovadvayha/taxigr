import { Text } from 'react-native';

import { colors, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';

type Props = {
  valueMinor: number;
  compact?: boolean;
  color?: string;
};

export function MoneyValue({ valueMinor, compact = false, color = colors.ink }: Props) {
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

