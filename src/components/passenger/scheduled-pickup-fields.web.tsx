import type { CSSProperties, MouseEvent } from 'react';
import { View } from 'react-native';

import { radius, spacing } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import type { ScheduledPickupFieldsProps } from './scheduled-pickup-fields';

function openPicker({ currentTarget }: MouseEvent<HTMLInputElement>) {
  try {
    currentTarget.showPicker?.();
  } catch {
    // Keep native input behavior when an embedded browser restricts showPicker.
  }
}

export function ScheduledPickupFields({ date, time, minDate, maxDate, onDateChange, onTimeChange }: ScheduledPickupFieldsProps) {
  const colors = useThemeColors();
  const style: CSSProperties = {
    minHeight: 44, width: '100%', minWidth: 0, boxSizing: 'border-box', cursor: 'pointer',
    padding: '6px 8px', font: 'inherit', fontSize: 16, color: colors.ink,
    backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.md,
  };
  return <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
    <View style={{ flex: 1.4, minWidth: 0 }}>
      <input type="date" aria-label="Дата подачи" value={date} min={minDate} max={maxDate} style={style}
        onClick={openPicker}
        onChange={(event) => onDateChange(event.currentTarget.value)} />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <input type="time" aria-label="Время подачи" value={time} style={style}
        onClick={openPicker}
        onChange={(event) => onTimeChange(event.currentTarget.value)} />
    </View>
  </View>;
}
