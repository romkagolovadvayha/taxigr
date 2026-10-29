import { ridePriceLabel } from '@/domain/ride-price';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { KpiCard } from '@/components/admin/kpi-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { AppButton } from '@/components/ui/app-button';
import { useForegroundScreen } from '@/hooks/use-foreground-screen';
import { demoAdminMetrics } from '@/data/demo';
import type { AdminMetrics } from '@/domain/models';
import { formatRouteLabel } from '@/domain/route-label';
import { useRide } from '@/state/ride-provider';
import { spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';
import { useThemeColors } from '@/theme/theme-provider';

export function AdminDashboardScreen() {
  const colors = useThemeColors();
  const { token } = useSession();
  const { adminOrders: orders, adminOrdersLoaded, loadAdminOrders } = useRide();
  const visible = useForegroundScreen();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recent = orders.slice(0, 4);

  useEffect(() => {
    if (visible) void loadAdminOrders();
  }, [loadAdminOrders, visible]);

  useEffect(() => {
    if (!token || !visible || !adminOrdersLoaded) return;
    if (token.startsWith('demo:')) {
      const timer = setTimeout(() => setMetrics(demoAdminMetrics), 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    // A dispatch can emit several order updates together. Refresh the visible
    // summary once after the burst instead of querying for every socket event.
    const timer = setTimeout(() => {
      void apiRequest<AdminMetrics>('/v1/admin/metrics', { token, signal: controller.signal })
      .then((value) => { setMetrics(value); setError(null); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить сводку');
        }
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [adminOrdersLoaded, orders, retry, token, visible]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ padding: spacing.x6, gap: spacing.x8 }}
    >
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Операционная сводка</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>Такси Грахово · сегодня</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      {!!error && <AppButton variant="secondary" onPress={() => setRetry(value => value + 1)}>Повторить загрузку сводки</AppButton>}
      {!metrics && !error && <Text style={{ color: colors.inkSecondary }}>Загружаем сводку…</Text>}
      {!!metrics && <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.x5, paddingVertical: spacing.x5,
        borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
        <KpiCard label="Активные заказы" value={String(metrics.activeOrders)} hint="Сейчас выполняются" icon="orders" />
        <KpiCard label="Водители на линии" value={String(metrics.onlineDrivers)} hint="Готовы принять заказ" icon="car" />
        <KpiCard label="Новые заявки" value={String(metrics.pendingApplications)} hint="Нужна проверка" icon="document" />
        <KpiCard label="Комиссия сегодня" value={formatMoney(metrics.commissionTodayMinor)} hint={`Оборот ${formatMoney(metrics.grossTodayMinor)}`} icon="earnings" />
      </View>}
      <SurfaceCard style={{ borderWidth: 0, padding: 0, borderRadius: 0 }}>
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
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{ridePriceLabel(order)}</Text>
          </View>
        ))}
      </SurfaceCard>
    </ScrollView>
  );
}
