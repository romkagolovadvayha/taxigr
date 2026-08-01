import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { demoOrders } from '@/data/demo';
import type { RideOrder } from '@/domain/models';
import { rideStatusLabel } from '@/domain/ride-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime, formatDuration, formatMoney } from '@/utils/format';

export function DriverTripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const [order, setOrder] = useState<RideOrder | null>(
    token?.startsWith('demo:') ? demoOrders.find((item) => item.id === id) ?? null : null,
  );
  const [loading, setLoading] = useState(!token?.startsWith('demo:'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || token.startsWith('demo:') || !id) return;
    let active = true;
    void apiRequest<RideOrder>(`/v1/orders/${id}`, { token })
      .then((result) => {
        if (!active) return;
        setOrder(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить поездку');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, token]);

  if (loading) {
    return (
      <Screen contentStyle={{ maxWidth: 760, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen contentStyle={{ maxWidth: 760 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Поездка не найдена
        </Text>
        {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      </Screen>
    );
  }

  const netMinor = order.priceMinor - order.serviceCommissionMinor;
  const rows = [
    ['Тариф', order.tariff === 'child' ? 'Детский' : 'Эконом'],
    ['Расстояние', `${(order.distanceMeters / 1_000).toFixed(1).replace('.', ',')} км`],
    ['В пути', formatDuration(Math.max(1, Math.round(order.durationSeconds / 60)))],
    ['Получено от пассажира', formatMoney(order.priceMinor)],
    ['Комиссия сервиса', `− ${formatMoney(order.serviceCommissionMinor)}`],
    ['Остаётся водителю', formatMoney(netMinor)],
    ['Создан', formatDateTime(order.createdAt)],
  ];

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Детали поездки
          </Text>
          <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
            № {order.id}
          </Text>
        </View>
        <MoneyValue valueMinor={netMinor} color={colors.success} />
      </View>

      <View
        style={{
          padding: spacing.x5,
          gap: spacing.x4,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 }}>
          <StatusChip
            label={rideStatusLabel[order.status]}
            tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'info'}
          />
          {order.passenger && (
            <RatingBadge rating={order.passenger.rating} count={order.passenger.ratingCount} compact />
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
          <AppIcon name="profile" />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
              {order.passenger?.name ?? 'Пассажир'}
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Оценка водителя: {order.ratings?.byDriver ? `${order.ratings.byDriver} из 5` : 'не выставлена'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
          <AppIcon name="location" />
          <View style={{ flex: 1, gap: spacing.x3 }}>
            <View>
              <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>ПОДАЧА</Text>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{order.pickup.label}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <View>
              <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>НАЗНАЧЕНИЕ</Text>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{order.destination.label}</Text>
            </View>
          </View>
        </View>
      </View>

      <WaitingBreakdown ride={order} />

      <View
        style={{
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {rows.map(([label, value], index) => (
          <View
            key={label}
            style={{
              minHeight: 54,
              paddingHorizontal: spacing.x4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.x4,
              borderTopWidth: index ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{label}</Text>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink, textAlign: 'right' }}>{value}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
