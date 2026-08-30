import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { AppIcon } from '@/components/ui/app-icon';
import { WaitingBreakdown } from '@/components/ride/waiting-breakdown';
import { IconButton } from '@/components/ui/icon-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { rideStatusLabel } from '@/domain/ride-state';
import { pricingScopeLabel } from '@/domain/pricing';
import { formatMultiStopRouteAddresses } from '@/domain/route-label';
import { goBackOrReplace } from '@/navigation/back';
import { formatWaitingDuration } from '@/domain/waiting';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime, formatDuration, formatMoney } from '@/utils/format';

export function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, error } = useRide();
  const order = orders.find((item) => item.id === id);

  if (!order) {
    return (
      <Screen contentStyle={{ maxWidth: 760 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/orders')} />
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Заказ не найден
        </Text>
      </Screen>
    );
  }

  const destinations = order.destinations ?? [order.destination];
  const routeAddresses = formatMultiStopRouteAddresses(order.pickup, destinations);
  const rows = [
    ['Тариф', order.tariff === 'child' ? 'Детский' : 'Эконом'],
    [
      'Расчёт маршрута',
      pricingScopeLabel[order.pricingScope ?? 'intercity'],
    ],
    [
      'Оплата',
      order.paymentMethod === 'direct'
        ? 'Напрямую водителю'
        : order.paymentMethod === 'transfer'
          ? 'Перевод водителю'
          : 'Наличные',
    ],
    ['Расстояние', `${(order.distanceMeters / 1_000).toFixed(1).replace('.', ',')} км`],
    ['В пути', formatDuration(Math.round(order.durationSeconds / 60))],
    [
      'Стоимость маршрута',
      formatMoney(order.basePriceMinor ?? order.priceMinor),
    ],
    ...((order.searchPriceIncreaseMinor ?? 0) > 0
      ? [['Повышение цены', `+ ${formatMoney(order.searchPriceIncreaseMinor ?? 0)}`]]
      : []),
    ...(order.waitingSeconds || order.waitingPriceMinor
      ? [
          [
            `Ожидание · ${formatWaitingDuration(order.waitingSeconds ?? 0)}`,
            `+ ${formatMoney(order.waitingPriceMinor ?? 0)}`,
          ],
        ]
      : []),
    ['Итого', formatMoney(order.priceMinor)],
    ['Создан', formatDateTime(order.createdAt)],
  ];

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/orders')} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Детали поездки
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            № {order.id}
          </Text>
        </View>
        <MoneyValue valueMinor={order.priceMinor} />
      </View>
      <WaitingBreakdown ride={order} />
      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
          {error}
        </Text>
      )}
      {order.driver &&
        !['completed', 'cancelled'].includes(order.status) &&
        !!order.driver.phone && (
          <PhoneCallButton
            phone={order.driver.phone}
            label="Позвонить водителю"
          />
        )}
      {order.driver && !['completed', 'cancelled'].includes(order.status) && (
        <RideChatButton orderId={order.id} label="Написать водителю" />
      )}
      <View
        style={{
          padding: spacing.x5,
          gap: spacing.x4,
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <StatusChip label={rideStatusLabel[order.status]} tone={order.status === 'completed' ? 'success' : 'info'} />
        <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
          <AppIcon name="location" />
          <View style={{ flex: 1, gap: spacing.x3 }}>
            <View>
              <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>ОТКУДА</Text>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{routeAddresses.pickup}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            {routeAddresses.destinations.map((label, index) => (
              <View key={`${label}:${index}`}>
                <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
                  {index === destinations.length - 1 ? 'КУДА' : `ОСТАНОВКА ${index + 1}`}
                </Text>
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
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
        {rows.map(([label, value], index) => (
          <View
            key={label}
            style={{
              minHeight: 52,
              paddingHorizontal: spacing.x4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopWidth: index ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{label}</Text>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{value}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
