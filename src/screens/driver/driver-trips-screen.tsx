import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { AppButton } from '@/components/ui/app-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { demoDriver, demoOrders } from '@/data/demo';
import type { RideOrder } from '@/domain/models';
import { formatRouteLabel } from '@/domain/route-label';
import { rideStatusLabel } from '@/domain/ride-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime, formatMoney } from '@/utils/format';

function statusTone(status: RideOrder['status']): 'success' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'info';
}

export function DriverTripsScreen() {
  const { token } = useSession();
  const [orders, setOrders] = useState<RideOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (token.startsWith('demo:')) {
        setOrders(demoOrders.filter((order) => order.driverId === demoDriver.id));
        setHasMore(false);
      } else {
        const fetched = await apiRequest<RideOrder[]>('/v1/orders?scope=driver&limit=50', { token });
        setOrders(fetched);
        setHasMore(fetched.length === 50);
      }
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить поездки');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (!token || token.startsWith('demo:') || !hasMore) return;
    const cursor = orders.at(-1);
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const fetched = await apiRequest<RideOrder[]>(
        `/v1/orders?scope=driver&limit=50&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`,
        { token },
      );
      const existingIds = new Set(orders.map((order) => order.id));
      setOrders((current) => [...current, ...fetched.filter((order) => !existingIds.has(order.id))]);
      setHasMore(fetched.length === 50);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить ранние поездки');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, orders, token]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const completed = useMemo(
    () => orders.filter((order) => order.status === 'completed'),
    [orders],
  );
  const grossMinor = completed.reduce((sum, order) => sum + order.priceMinor, 0);
  const netMinor = completed.reduce(
    (sum, order) => sum + order.priceMinor - order.serviceCommissionMinor,
    0,
  );

  return (
    <Screen contentStyle={{ maxWidth: 900 }}>
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Поездки
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          История выполненных и отменённых заказов
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 150,
            padding: spacing.x4,
            gap: spacing.x1,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Выполнено</Text>
          <Text selectable style={{ ...typography.sectionTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {completed.length}
          </Text>
        </View>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 180,
            padding: spacing.x4,
            gap: spacing.x1,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Получено</Text>
          <MoneyValue valueMinor={grossMinor} compact />
        </View>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 180,
            padding: spacing.x4,
            gap: spacing.x1,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>После комиссии</Text>
          <MoneyValue valueMinor={netMinor} compact color={colors.success} />
        </View>
      </View>
      {hasMore && (
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Итоги рассчитаны по {orders.length} загруженным поездкам. После загрузки ранних поездок они обновятся.
        </Text>
      )}

      {!!error && (
        <View style={{ gap: spacing.x3 }}>
          <Text accessibilityRole="alert" selectable style={{ ...typography.body, color: colors.danger }}>
            {error}
          </Text>
          <AppButton variant="secondary" onPress={() => void load()}>Повторить</AppButton>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : orders.length === 0 ? (
        <View
          style={{
            alignItems: 'center',
            padding: spacing.x8,
            gap: spacing.x3,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <AppIcon name="orders" size={32} color={colors.inkMuted} />
          <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Поездок пока нет</Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
            Принятые заказы появятся здесь после первой поездки.
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.x3 }}>
          {orders.map((order) => (
            <AnimatedPressable
              feedback="subtle"
              key={order.id}
              accessibilityRole="button"
              accessibilityLabel={`Поездка ${formatDateTime(order.createdAt)}`}
              onPress={() =>
                router.push(
                  { pathname: '/driver/trips/[id]', params: { id: order.id } } as never,
                )
              }
              style={({ pressed }) => ({
                padding: spacing.x4,
                gap: spacing.x3,
                borderRadius: radius.card,
                borderCurve: 'continuous',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.canvas,
                  }}
                >
                  <AppIcon name={order.tariff === 'child' ? 'child-seat' : 'car'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                    {order.passenger?.name ?? 'Пассажир'} · {formatDateTime(order.createdAt)}
                  </Text>
                  <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
                    {formatRouteLabel(order.pickup, order.destination)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: spacing.x1 }}>
                  <MoneyValue valueMinor={order.priceMinor} compact />
                  {order.status === 'completed' && (
                    <Text selectable style={{ ...typography.micro, color: colors.successText }}>
                      вам {formatMoney(order.priceMinor - order.serviceCommissionMinor)}
                    </Text>
                  )}
                </View>
              </View>
              <StatusChip label={rideStatusLabel[order.status]} tone={statusTone(order.status)} />
            </AnimatedPressable>
          ))}
          {hasMore && (
            <AppButton variant="secondary" loading={loadingMore} onPress={() => void loadMore()}>
              Показать более ранние поездки
            </AppButton>
          )}
        </View>
      )}
    </Screen>
  );
}
