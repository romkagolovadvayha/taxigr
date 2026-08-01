import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { SurfaceCard } from '@/components/ui/surface-card';
import { demoEarnings } from '@/data/demo';
import type { EarningsSummary } from '@/domain/models';
import { colors, spacing, typography } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

type EarningsPeriod = EarningsSummary['period'];

const periods: { value: EarningsPeriod; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: '7 дней' },
  { value: 'month', label: '30 дней' },
];

function demoEarningsForPeriod(period: EarningsPeriod): EarningsSummary {
  const multiplier = period === 'month' ? 22 : period === 'week' ? 6 : 1;
  return {
    ...demoEarnings,
    period,
    grossMinor: demoEarnings.grossMinor * multiplier,
    commissionMinor: demoEarnings.commissionMinor * multiplier,
    netMinor: demoEarnings.netMinor * multiplier,
    rides: demoEarnings.rides * multiplier,
    onlineMinutes: demoEarnings.onlineMinutes * multiplier,
  };
}

export function EarningsScreen() {
  const { token } = useSession();
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const [earnings, setEarnings] = useState<EarningsSummary>({
    period: 'today',
    grossMinor: 0,
    commissionMinor: 0,
    netMinor: 0,
    rides: 0,
    onlineMinutes: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (token.startsWith('demo:')) {
      const timer = setTimeout(() => {
        setEarnings(demoEarningsForPeriod(period));
        setError(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    void apiRequest<EarningsSummary>(`/v1/driver/earnings?period=${period}`, { token })
      .then((result) => {
        setEarnings(result);
        setError(null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить заработок'));
  }, [period, token]);

  const commissionPercent = earnings.grossMinor
    ? Math.round((earnings.commissionMinor / earnings.grossMinor) * 100)
    : 0;
  return (
    <Screen>
      <View>
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Расчёты с сервисом
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Выручка, комиссия и время на линии · комиссия сервиса {commissionPercent}%
        </Text>
      </View>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          padding: spacing.x1,
          gap: spacing.x1,
          borderRadius: 18,
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        {periods.map((item) => {
          const selected = item.value === period;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setPeriod(item.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                backgroundColor: selected ? colors.surface : colors.transparent,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ ...typography.caption, color: selected ? colors.ink : colors.inkSecondary }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
        <SurfaceCard style={{ flexGrow: 1, flexBasis: 220 }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Получено от пассажиров
          </Text>
          <MoneyValue valueMinor={earnings.grossMinor} />
          <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>{earnings.rides} поездок</Text>
        </SurfaceCard>
        <SurfaceCard style={{ flexGrow: 1, flexBasis: 220 }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Начислено сервису
          </Text>
          <MoneyValue valueMinor={earnings.commissionMinor} color={colors.danger} />
          <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
            Войдёт в расчёт за период
          </Text>
        </SurfaceCard>
        <SurfaceCard style={{ flexGrow: 1, flexBasis: 220 }}>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Остаётся у вас
          </Text>
          <MoneyValue valueMinor={earnings.netMinor} color={colors.success} />
          <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
            После начисленной комиссии, до налогов
          </Text>
        </SurfaceCard>
      </View>
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Статистика смены</Text>
        <View style={{ flexDirection: 'row', gap: spacing.x8, flexWrap: 'wrap' }}>
          <View>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>На линии</Text>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>{formatDuration(earnings.onlineMinutes)}</Text>
          </View>
          <View>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Средний заказ</Text>
            <MoneyValue valueMinor={earnings.rides ? Math.round(earnings.grossMinor / earnings.rides) : 0} compact />
          </View>
        </View>
      </SurfaceCard>
      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
        Пассажир рассчитывается напрямую с вами. Сервис не удерживает деньги за поездку
        и не выплачивает зарплату. Комиссия фиксируется в завершённом заказе, суммируется
        за расчётный период и не меняется задним числом.
      </Text>
      <AppButton variant="secondary" onPress={() => router.push('/driver/trips' as never)}>
        Открыть историю поездок
      </AppButton>
    </Screen>
  );
}
