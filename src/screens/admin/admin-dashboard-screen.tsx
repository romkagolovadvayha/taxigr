import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { KpiCard } from '@/components/admin/kpi-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { demoAdminMetrics } from '@/data/demo';
import type { AdminMetrics } from '@/domain/models';
import { formatRouteLabel } from '@/domain/route-label';
import { useRide } from '@/state/ride-provider';
import { colors, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';

export function AdminDashboardScreen() {
  const { token } = useSession();
  const { adminOrders: orders } = useRide();
  const [metrics, setMetrics] = useState<AdminMetrics>({
    activeOrders: 0,
    onlineDrivers: 0,
    pendingApplications: 0,
    grossTodayMinor: 0,
    commissionTodayMinor: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const recent = orders.slice(0, 4);

  useEffect(() => {
    if (!token) return;
    if (token.startsWith('demo:')) {
      const timer = setTimeout(() => setMetrics(demoAdminMetrics), 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    void apiRequest<AdminMetrics>('/v1/admin/metrics', { token, signal: controller.signal })
      .then(setMetrics)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить сводку');
        }
      });
    return () => controller.abort();
  }, [token]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing.x6, gap: spacing.x6 }}
    >
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Операционная сводка</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>Такси Грахово · сегодня</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
        <KpiCard label="Активные заказы" value={String(metrics.activeOrders)} hint="Сейчас выполняются" icon="orders" />
        <KpiCard label="Водители на линии" value={String(metrics.onlineDrivers)} hint="Готовы принять заказ" icon="car" />
        <KpiCard label="Новые заявки" value={String(metrics.pendingApplications)} hint="Нужна проверка" icon="document" />
        <KpiCard label="Комиссия сегодня" value={formatMoney(metrics.commissionTodayMinor)} hint={`Оборот ${formatMoney(metrics.grossTodayMinor)}`} icon="earnings" />
      </View>
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Последние заказы</Text>
        {recent.map((order, index) => (
          <View
            key={order.id}
            style={{
              minHeight: 58,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.x3,
              borderTopWidth: index ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <Text selectable style={{ ...typography.caption, color: colors.inkMuted, width: 110 }}>{order.id.slice(0, 14)}</Text>
            <Text selectable numberOfLines={1} style={{ ...typography.body, color: colors.ink, flex: 1 }}>
              {formatRouteLabel(order.pickup, order.destination)}
            </Text>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{formatMoney(order.priceMinor)}</Text>
          </View>
        ))}
      </SurfaceCard>
    </ScrollView>
  );
}
