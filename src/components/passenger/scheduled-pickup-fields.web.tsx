import { useState, type ComponentProps } from 'react';
import { Text } from 'react-native';

import { formatPickupDate } from '@/domain/scheduled-ride';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import type { ScheduledPickupFieldsProps } from './scheduled-pickup-fields';

function openPicker(input: HTMLInputElement) {
  try {
    if (!input.showPicker) return false;
    input.showPicker();
    return true;
  } catch {
    return false;
  }
}

function PickupInput({ label, display, basis, ...props }: ComponentProps<'input'> & { label: string; display: string; basis: number }) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  return <label style={{ position: 'relative', flex: `1 1 ${basis}px`, minWidth: 0, minHeight: 54, boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6px 12px',
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    border: `1px solid ${focused ? colors.inkSecondary : colors.border}` }}>
    <Text aria-hidden style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
    <Text aria-hidden numberOfLines={1} style={{ ...typography.bodyStrong, fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] }}>{display}</Text>
    {/* Keep the native picker without using its locale-dependent text for layout. */}
    <input {...props} aria-label={`${label} подачи`} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onClick={(event) => { openPicker(event.currentTarget); }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && openPicker(event.currentTarget)) event.preventDefault();
      }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minWidth: 0,
        boxSizing: 'border-box', margin: 0, opacity: 0, cursor: 'pointer', fontSize: 16 }} />
  </label>;
}

export function ScheduledPickupFields({ date, time, minDate, maxDate, onDateChange, onTimeChange }: ScheduledPickupFieldsProps) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.x2 }}>
    <PickupInput label="Дата" type="date" basis={130} display={formatPickupDate(date)} value={date} min={minDate} max={maxDate}
      onChange={(event) => onDateChange(event.currentTarget.value)} />
    <PickupInput label="Время" type="time" basis={96} display={time} value={time}
      onChange={(event) => onTimeChange(event.currentTarget.value)} />
  </div>;
}
