import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { MoneyValue } from '@/components/ui/money-value';
import { StatusChip } from '@/components/ui/status-chip';
import type { RideOrder } from '@/domain/models';
import { formatRouteAddresses } from '@/domain/route-label';
import { rideStatusLabel } from '@/domain/ride-state';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export function AdminOrdersScreen() {
  const { token } = useSession();
  const { adminOrders: orders, adminOrdersHasMore, loadMoreAdminOrders, refresh } = useRide();
  const [selectedOrder, setSelectedOrder] = useState<RideOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const cancelSelectedOrder = async () => {
    if (!selectedOrder || !token) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/orders/${selectedOrder.id}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: cancellationReason.trim() }),
      });
      setSelectedOrder(null);
      setCancellationReason('');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить заказ');
    } finally {
      setBusy(false);
    }
  };
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
              alignContent: 'center',
              flexWrap: 'wrap',
              gap: spacing.x4,
              paddingHorizontal: spacing.x4,
              paddingVertical: spacing.x3,
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
              <AppButton
                variant="secondary"
                compact
                fullWidth={false}
                onPress={() => router.push(`/admin/orders/${order.id}` as never)}
              >
                Подробнее
              </AppButton>
              {!['completed', 'cancelled'].includes(order.status) && (
                <AppButton
                  variant="quiet"
                  compact
                  fullWidth={false}
                  onPress={() => {
                    setCancellationReason('');
                    setSelectedOrder(order);
                  }}
                >
                  Отменить
                </AppButton>
              )}
            </View>
          </View>
        ))}
      </View>
      {adminOrdersHasMore && (
        <AppButton
          variant="secondary"
          loading={loadingMore}
          onPress={() => {
            setLoadingMore(true);
            void loadMoreAdminOrders().finally(() => setLoadingMore(false));
          }}
        >
          Показать более ранние заказы
        </AppButton>
      )}
      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}
      <AppModal
        visible={!!selectedOrder}
        title="Отменить активный заказ?"
        description="Пассажир и назначенный водитель сразу получат уведомление. Используйте это действие только для поддержки или аварийной ситуации."
        onClose={() => setSelectedOrder(null)}
      >
        <TextInput
          value={cancellationReason}
          onChangeText={(value) => setCancellationReason(value.slice(0, 500))}
          placeholder="Причина для журнала и поддержки"
          placeholderTextColor={colors.inkMuted}
          multiline
          maxLength={500}
          accessibilityLabel="Причина отмены заказа"
          style={{
            ...typography.body,
            minHeight: 88,
            padding: spacing.x3,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            color: colors.ink,
            backgroundColor: colors.surface,
            textAlignVertical: 'top',
          }}
        />
        <AppButton
          variant="danger"
          loading={busy}
          disabled={cancellationReason.trim().length < 3}
          onPress={() => void cancelSelectedOrder()}
        >
          Отменить заказ
        </AppButton>
        <AppButton variant="secondary" disabled={busy} onPress={() => setSelectedOrder(null)}>
          Оставить без изменений
        </AppButton>
      </AppModal>
    </ScrollView>
  );
}
