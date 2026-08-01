import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { rideStatusLabel } from '@/domain/ride-state';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime } from '@/utils/format';

export function OrdersScreen() {
  const { orders } = useRide();
  return (
    <Screen contentStyle={{ maxWidth: 900 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <View>
          <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Мои поездки
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Все заказы и чеки
          </Text>
        </View>
      </View>
      <View style={{ gap: spacing.x3 }}>
        {orders.map((order) => (
          <Pressable
            key={order.id}
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
                    {order.pickup.label} → {order.destination.label}
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
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

