import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { formatRouteLabel } from '@/domain/route-label';
import { rideStatusLabel } from '@/domain/ride-state';
import { goBackOrReplace } from '@/navigation/back';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime } from '@/utils/format';

export function OrdersScreen() {
  const { orders, passengerOrdersHasMore, loadMorePassengerOrders } = useRide();
  const [loadingMore, setLoadingMore] = useState(false);
  return (
    <Screen contentStyle={{ maxWidth: 900 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/')} />
        <View>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Мои поездки
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Все заказы и чеки
          </Text>
        </View>
      </View>
      <View style={{ gap: spacing.x3 }}>
        {orders.length === 0 && (
          <View
            style={{
              padding: spacing.x6,
              gap: spacing.x4,
              alignItems: 'center',
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppIcon name="orders" size={28} color={colors.inkMuted} />
            <View style={{ gap: spacing.x2, alignItems: 'center' }}>
              <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
                Поездок пока нет
              </Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
                Здесь появятся активные и завершённые заказы.
              </Text>
            </View>
            <AppButton fullWidth={false} onPress={() => router.replace('/')}>
              Заказать такси
            </AppButton>
          </View>
        )}
        {orders.map((order) => (
          <AnimatedPressable
            feedback="subtle"
            key={order.id}
            accessibilityRole="button"
            accessibilityLabel={`Поездка ${formatDateTime(order.createdAt)}: ${formatRouteLabel(order.pickup, order.destination)}`}
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
            style={({ pressed }) => ({
              padding: spacing.x4,
              gap: spacing.x3,
              borderRadius: radius.card,
              borderCurve: 'continuous',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3, flex: 1 }}>
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
                <View style={{ flex: 1 }}>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                    {order.tariff === 'child' ? 'Детский' : 'Эконом'} · {formatDateTime(order.createdAt)}
                  </Text>
                  <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
                    {formatRouteLabel(order.pickup, order.destination)}
                  </Text>
                </View>
              </View>
              <MoneyValue valueMinor={order.priceMinor} compact />
            </View>
            <StatusChip
              label={rideStatusLabel[order.status]}
              tone={
                order.status === 'completed'
                  ? 'success'
                  : order.status === 'cancelled'
                    ? 'danger'
                    : 'info'
              }
            />
          </AnimatedPressable>
        ))}
        {passengerOrdersHasMore && (
          <AppButton
            variant="secondary"
            loading={loadingMore}
            onPress={() => {
              setLoadingMore(true);
              void loadMorePassengerOrders().finally(() => setLoadingMore(false));
            }}
          >
            Показать более ранние поездки
          </AppButton>
        )}
      </View>
    </Screen>
  );
}
