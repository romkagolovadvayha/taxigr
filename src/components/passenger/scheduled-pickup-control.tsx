import { useState } from 'react';
import { Text, View } from 'react-native';

import { ScheduledPickupFields } from '@/components/passenger/scheduled-pickup-fields';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { formatScheduledPickup, preorderBounds, preorderMaxLeadDays, preorderMinLeadMinutes } from '@/domain/scheduled-ride';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { useRide } from '@/state/ride-provider';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';

function grahovoWallTime(timestamp: number) {
  return new Date(timestamp + 4 * 3_600_000).toISOString();
}

export function ScheduledPickupControl({ disabled }: { disabled?: boolean }) {
  const colors = useThemeColors();
  const { scheduledAt, selectScheduledAt } = useRide();
  const [step, setStep] = useState<'mode' | 'time' | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [validation, setValidation] = useState(false);
  const now = useScreenClock(30_000, step === 'time');
  const { min, max } = preorderBounds(now);
  const label = scheduledAt ? formatScheduledPickup(scheduledAt) : 'Заказать сейчас';
  const openTime = () => {
    const earliest = preorderBounds(Date.now()).min;
    const initial = scheduledAt ? Math.max(Date.parse(scheduledAt), earliest) : earliest + 30 * 60_000;
    const value = grahovoWallTime(initial);
    setDate(value.slice(0, 10));
    setTime(value.slice(11, 16));
    setValidation(false);
    setStep('time');
  };
  const confirm = () => {
    const value = Date.parse(`${date}T${time}:00+04:00`);
    const bounds = preorderBounds(Date.now());
    if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
      setValidation(true);
      return;
    }
    selectScheduledAt(new Date(value).toISOString());
    setStep(null);
  };

  return <>
    <AppButton compact variant="secondary" disabled={disabled} style={{ minHeight: 44 }}
      accessibilityLabel={`Время подачи: ${label}`} accessibilityState={{ expanded: step !== null }}
      icon={<AppIcon name="clock" size={18} />} onPress={() => setStep('mode')}>
      {`${label} ▾`}
    </AppButton>
    <AppModal visible={step !== null} title={step === 'time' ? 'Выберите время подачи' : 'Когда подать машину?'}
      onClose={() => setStep(null)}>
      {step === 'time' ? <View style={{ gap: spacing.x3 }}>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Местное время Грахово. От {preorderMinLeadMinutes} минут до {preorderMaxLeadDays} дней вперёд.
        </Text>
        <ScheduledPickupFields date={date} time={time} minDate={grahovoWallTime(min).slice(0, 10)}
          maxDate={grahovoWallTime(max).slice(0, 10)} onDateChange={setDate} onTimeChange={setTime} />
        {validation && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>
          Выберите дату и время в указанном диапазоне.
        </Text>}
        <AppButton compact onPress={confirm}>Установить время</AppButton>
      </View> : <View style={{ gap: spacing.x2 }}>
        <AppButton compact variant={scheduledAt ? 'secondary' : 'primary'}
          onPress={() => { selectScheduledAt(undefined); setStep(null); }}>Заказать сейчас</AppButton>
        <AppButton compact variant={scheduledAt ? 'primary' : 'secondary'} onPress={openTime}>Заказать ко времени</AppButton>
      </View>}
    </AppModal>
  </>;
}
