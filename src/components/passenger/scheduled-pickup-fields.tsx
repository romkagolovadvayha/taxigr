import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Text, View, useWindowDimensions } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { spacing, typography } from '@/theme/tokens';
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
  const { width, height } = useWindowDimensions();
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  if (Platform.OS === 'ios') {
    return <DateTimePicker mode="datetime" display="compact" locale="ru_RU" timeZoneName="Europe/Samara"
      value={new Date(`${date}T${time}:00+04:00`)} minimumDate={new Date(`${minDate}T00:00:00+04:00`)}
      maximumDate={new Date(`${maxDate}T23:59:00+04:00`)} onValueChange={(_, next) => {
        const wallTime = new Date(next.getTime() + 4 * 3_600_000).toISOString();
        onDateChange(wallTime.slice(0, 10));
        onTimeChange(wallTime.slice(11, 16));
      }} />;
  }

  const [hour, minute] = time.split(':').map(Number);
  return <View style={{ gap: spacing.x2 }}>
    <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Дата и время</Text>
    <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
      <AppButton compact fullWidth={false} variant="secondary" style={{ flex: 1 }}
        accessibilityLabel="Выбрать дату подачи" onPress={() => setPicker('date')}>{date.split('-').reverse().join('.')}</AppButton>
      <AppButton compact fullWidth={false} variant="secondary" style={{ flex: 1 }}
        accessibilityLabel="Выбрать время подачи" onPress={() => setPicker('time')}>{time}</AppButton>
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
  </View>;
}
