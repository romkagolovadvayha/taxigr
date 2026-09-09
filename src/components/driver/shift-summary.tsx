import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { demoEarnings } from '@/data/demo';
import type { EarningsSummary } from '@/domain/models';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';
import { formatDuration, formatMoney } from '@/utils/format';

export function ShiftSummary() {
  const colors = useThemeColors();
  const { token } = useSession();
  const [summary, setSummary] = useState<EarningsSummary | null>(token?.startsWith('demo:') ? demoEarnings : null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!token || token.startsWith('demo:')) return;
    const controller = new AbortController();
    void apiRequest<EarningsSummary>('/v1/driver/earnings?period=today', { token, signal: controller.signal })
      .then((result) => { setSummary(result); setFailed(false); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [token]));
  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="Посмотреть доход за сегодня" onPress={() => router.push('/driver/earnings')}
      style={{ paddingHorizontal: spacing.x5, paddingVertical: spacing.x6, gap: spacing.x2, backgroundColor: colors.canvas }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Остаётся у вас сегодня</Text>
        <AppIcon name="chevron" color={colors.inkSecondary} size={18} />
      </View>
      <Text style={{ ...typography.display, fontSize: 36, lineHeight: 44, color: colors.ink, fontVariant: ['tabular-nums'] }}>
        {summary ? formatMoney(summary.netMinor) : '— ₽'}
      </Text>
      <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
        {failed ? 'Не удалось обновить доход · откройте расчёты' : summary ? `${summary.rides} поездок · ${formatDuration(summary.onlineMinutes)} на линии` : 'Загружаем итоги смены…'}
      </Text>
    </AnimatedPressable>
  );
}
