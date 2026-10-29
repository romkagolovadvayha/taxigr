import { Text } from 'react-native';

import { typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  valueMinor: number;
  compact?: boolean;
  color?: string;
  pending?: boolean;
};

export function MoneyValue({ valueMinor, compact = false, color: customColor, pending = false }: Props) {
  const colors = useThemeColors();
  const color = customColor ?? colors.ink;
  return (
    <Text
      selectable
      style={{
        ...(compact || pending ? typography.bodyStrong : typography.money),
        color,
        fontVariant: ['tabular-nums'],
      }}
    >
      {pending ? 'Стоимость определит водитель' : formatMoney(valueMinor)}
    </Text>
  );
}

