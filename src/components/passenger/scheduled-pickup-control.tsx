import { useState } from 'react';
import { Text, View } from 'react-native';

import { ScheduledPickupFields } from '@/components/passenger/scheduled-pickup-fields';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { formatScheduledPickup, preorderBounds, preorderMaxLeadDays, preorderMinLeadMinutes } from '@/domain/scheduled-ride';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { useRide } from '@/state/ride-provider';
import { useThemeColors } from '@/theme/theme-provider';
import { componentSizing, spacing, typography } from '@/theme/tokens';

function grahovoWallTime(timestamp: number) {
  return new Date(timestamp + 4 * 3_600_000).toISOString();
}

const bookingSizing = componentSizing.booking;
const asapLabel = 'Как можно скорее';

export function ScheduledPickupControl({ disabled, dense }: { disabled?: boolean; dense?: boolean }) {
  const colors = useThemeColors();
  const { scheduledAt, selectScheduledAt } = useRide();
  const [step, setStep] = useState<'mode' | 'time' | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [validation, setValidation] = useState(false);
  const now = useScreenClock(30_000, step === 'time');
  const { min, max } = preorderBounds(now);
  const label = scheduledAt ? formatScheduledPickup(scheduledAt) : asapLabel;
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
    <View style={{ height: 1, backgroundColor: colors.border, marginLeft: bookingSizing.iconColumn + spacing.x3 }} />
    <AnimatedPressable feedback="subtle" accessibilityRole="button" disabled={disabled}
      accessibilityLabel={`Время подачи: ${label}`} accessibilityState={{ expanded: step !== null, disabled }}
      onPress={() => setStep('mode')}
      style={({ pressed }) => ({ minHeight: dense ? bookingSizing.compactRowHeight : bookingSizing.rowHeight,
        flexDirection: 'row', alignItems: 'center', gap: spacing.x3,
        opacity: disabled ? 0.55 : pressed ? 0.68 : 1 })}>
      <View style={{ width: bookingSizing.iconColumn, alignItems: 'center' }}>
        <AppIcon name="clock" size={bookingSizing.iconSize} color={colors.ink} />
      </View>
      <Text numberOfLines={1} style={{ ...typography.body, flex: 1, fontSize: dense ? 15 : 16, color: colors.ink }}>
        {scheduledAt ? formatScheduledPickup(scheduledAt, true) : label}
      </Text>
      <AppIcon name="chevron" size={16} color={colors.inkMuted} />
    </AnimatedPressable>
    <AppModal compact={dense} visible={step !== null} title={step === 'time' ? 'Выберите время подачи' : 'Когда подать машину?'}
      onClose={() => setStep(null)}>
      {step === 'time' ? <View style={{ gap: spacing.x3 }}>
        <ScheduledPickupFields date={date} time={time} minDate={grahovoWallTime(min).slice(0, 10)}
          maxDate={grahovoWallTime(max).slice(0, 10)} onDateChange={setDate} onTimeChange={setTime} />
        {validation && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>
          Выберите время подачи через {preorderMinLeadMinutes} минут или позже, не дальше чем через {preorderMaxLeadDays} дней.
        </Text>}
        <AppButton compact onPress={confirm}>Установить время</AppButton>
      </View> : <View style={{ gap: spacing.x2 }}>
        <AppButton compact variant={scheduledAt ? 'secondary' : 'primary'}
          onPress={() => { selectScheduledAt(undefined); setStep(null); }}>{asapLabel}</AppButton>
        <AppButton compact variant={scheduledAt ? 'primary' : 'secondary'} onPress={openTime}>Заказать ко времени</AppButton>
      </View>}
    </AppModal>
  </>;
}
