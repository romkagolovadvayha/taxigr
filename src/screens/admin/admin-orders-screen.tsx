import { ScrollView, Text, View } from 'react-native';

import { MoneyValue } from '@/components/ui/money-value';
import { StatusChip } from '@/components/ui/status-chip';
import { formatRouteAddresses } from '@/domain/route-label';
import { rideStatusLabel } from '@/domain/ride-state';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export function AdminOrdersScreen() {
  const { adminOrders: orders } = useRide();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing.x6, gap: spacing.x5 }}
    >
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Все заказы</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>Онлайн-монитор и история поездок</Text>
      </View>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {orders.map((order, index) => (
          <View
            key={order.id}
            style={{
              minHeight: 76,
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.x4,
              paddingHorizontal: spacing.x4,
              borderTopWidth: index ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <Text selectable style={{ ...typography.caption, color: colors.inkMuted, width: 120 }}>{order.id.slice(0, 16)}</Text>
            <View style={{ flex: 1, minWidth: 240 }}>
              <Text selectable numberOfLines={1} style={{ ...typography.bodyStrong, color: colors.ink }}>
                {formatRouteAddresses(order.pickup, order.destination).pickup}
              </Text>
              <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
                → {formatRouteAddresses(order.pickup, order.destination).destination}
              </Text>
            </View>
            <StatusChip label={rideStatusLabel[order.status]} tone={order.status === 'completed' ? 'success' : 'info'} />
            <MoneyValue valueMinor={order.priceMinor} compact />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
