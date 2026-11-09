import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppModal } from '@/components/ui/app-modal';
import { farePeriodAt, farePeriodLabel, type FarePeriod } from '@/domain/pricing';
import { formatScheduledPickup } from '@/domain/scheduled-ride';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, shadows, spacing, typography } from '@/theme/tokens';

const periodNames: Record<FarePeriod, string> = {
  '07-22': 'Дневной',
  '22-01': 'Вечерний',
  '01-07': 'Ночной',
};
const periods = ['07-22', '22-01', '01-07'] as const;

export function FarePeriodIndicator({ scheduledAt }: { scheduledAt?: string }) {
  const colors = useThemeColors();
  const now = useScreenClock(10_000, !scheduledAt);
  const [visible, setVisible] = useState(false);
  const trigger = useRef<View>(null);
  const period = farePeriodAt(scheduledAt ? new Date(scheduledAt) : new Date(now));
  const tones = {
    '07-22': { accent: colors.success, soft: colors.successSoft, text: colors.successText },
    '22-01': { accent: colors.brand, soft: colors.warningSoft, text: colors.warningText },
    '01-07': { accent: colors.danger, soft: colors.dangerSoft, text: colors.dangerText },
  };
  const active = tones[period];

  return <>
    <AnimatedPressable ref={trigger} feedback="subtle" accessibilityRole="button"
      accessibilityLabel={`${periodNames[period]} тариф. ${farePeriodLabel[period]}`}
      accessibilityState={{ expanded: visible }} onPress={() => setVisible(true)}
      style={{ width: 78, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center', ...shadows.subtle }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 52, height: 4, borderRadius: 2, backgroundColor: active.accent }} />
      <View pointerEvents="none" style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: active.soft,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...typography.bodyStrong, color: active.text }}>₽</Text>
      </View>
    </AnimatedPressable>
    <AppModal compact visible={visible} title="Тариф по времени" returnFocusRef={trigger} onClose={() => setVisible(false)}
      description={scheduledAt ? `Предзаказ на ${formatScheduledPickup(scheduledAt, true)} · время Грахово` : 'Местное время Грахово'}>
      <View style={{ gap: spacing.x3 }}>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
          Поздним вечером и ночью поездка может стоить дороже, а ожидание машины — дольше.
        </Text>
        <View style={{ gap: spacing.x1 }}>
          {periods.map(item => {
            const selected = item === period;
            const tone = tones[item];
            return <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3,
              paddingHorizontal: spacing.x3, paddingVertical: spacing.x2, borderRadius: radius.md,
              backgroundColor: selected ? tone.soft : colors.surfaceSecondary }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.bodyStrong, color: colors.ink }}>{periodNames[item]}</Text>
                <Text style={{ ...typography.caption, color: colors.inkSecondary }}>{farePeriodLabel[item]}</Text>
              </View>
              {selected && <Text style={{ ...typography.micro, color: tone.text }}>{scheduledAt ? 'Выбран' : 'Сейчас'}</Text>}
            </View>;
          })}
        </View>
      </View>
    </AppModal>
  </>;
}
