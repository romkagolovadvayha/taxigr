import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { formatPickupDate } from '@/domain/scheduled-ride';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

export type ScheduledPickupFieldsProps = {
  date: string;
  time: string;
  minDate: string;
  maxDate: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
};

export function ScheduledPickupFields({ date, time, minDate, maxDate, onDateChange, onTimeChange }: ScheduledPickupFieldsProps) {
  const colors = useThemeColors();
  const { width, height, fontScale } = useWindowDimensions();
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  if (process.env.EXPO_OS === 'ios') {
    return <DateTimePicker mode="datetime" display="compact" locale="ru_RU" timeZoneName="Europe/Samara"
      value={new Date(`${date}T${time}:00+04:00`)} minimumDate={new Date(`${minDate}T00:00:00+04:00`)}
      maximumDate={new Date(`${maxDate}T23:59:00+04:00`)} onValueChange={(_, next) => {
        const wallTime = new Date(next.getTime() + 4 * 3_600_000).toISOString();
        onDateChange(wallTime.slice(0, 10));
        onTimeChange(wallTime.slice(11, 16));
      }} />;
  }

  const [hour, minute] = time.split(':').map(Number);
  const fields = [{ key: 'date', label: 'Дата', value: formatPickupDate(date) }, { key: 'time', label: 'Время', value: time }] as const;
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
      {fields.map(({ key, label, value }) => <Pressable key={key} accessibilityRole="button"
        accessibilityLabel={`${label} подачи: ${value}`} onPress={() => setPicker(key)}
        style={({ pressed }) => ({ flexBasis: Math.ceil((key === 'date' ? 104 : 70) * fontScale) + 26,
          flexGrow: 1, flexShrink: 1, minHeight: 54, justifyContent: 'center',
          paddingHorizontal: spacing.x3, paddingVertical: spacing.x1, borderRadius: radius.md, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
        <Text style={{ ...typography.bodyStrong, fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      </Pressable>)}
    </View>
    {picker === 'date' && <DateTimePicker mode="date" display={width < 360 || height < 560 ? 'spinner' : 'default'}
      value={new Date(`${date}T00:00:00Z`)}
      minimumDate={new Date(`${minDate}T00:00:00Z`)} maximumDate={new Date(`${maxDate}T00:00:00Z`)}
      onDismiss={() => setPicker(null)} positiveButton={{ label: 'Выбрать' }} negativeButton={{ label: 'Отмена' }}
      onValueChange={(_, next) => { onDateChange(next.toISOString().slice(0, 10)); setPicker(null); }} />}
    {picker === 'time' && <DateTimePicker mode="time" is24Hour value={new Date(2020, 0, 1, hour, minute)}
      onDismiss={() => setPicker(null)} positiveButton={{ label: 'Выбрать' }} negativeButton={{ label: 'Отмена' }}
      onValueChange={(_, next) => {
        onTimeChange(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
        setPicker(null);
      }} />}
  </>;
}
