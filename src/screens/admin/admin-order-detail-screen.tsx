import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import {
  RideChatAvatar,
  RideChatMessageRow,
} from '@/components/ride/ride-chat-message-row';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { MoneyValue } from '@/components/ui/money-value';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import { demoOrders } from '@/data/demo';
import type { RideOrder } from '@/domain/models';
import { pricingScopeLabel } from '@/domain/pricing';
import { rideStatusLabel } from '@/domain/ride-state';
import { formatWaitingDuration } from '@/domain/waiting';
import { useRideChat } from '@/hooks/use-ride-chat';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { goBackOrReplace } from '@/navigation/back';
import { colors, spacing, typography } from '@/theme/tokens';
import { formatDateTime, formatDuration, formatMoney } from '@/utils/format';

type Props = { id: string };

const tariffLabels: Record<RideOrder['tariff'], string> = {
  economy: 'Эконом',
  child: 'Детский',
};

const paymentLabels: Record<RideOrder['paymentMethod'], string> = {
  cash: 'Наличные',
  transfer: 'Перевод водителю',
  direct: 'Напрямую водителю',
};

function DetailRows({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value], index) => (
        <View
          key={label}
          style={{
            minHeight: spacing.x12,
            paddingVertical: spacing.x2,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.x3,
            borderTopWidth: index ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            {label}
          </Text>
          <Text
            selectable
            style={{
              ...typography.bodyStrong,
              color: colors.ink,
              textAlign: 'right',
              fontVariant: ['tabular-nums'],
            }}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AdminOrderDetailScreen({ id }: Props) {
  const { token } = useSession();
  const { isDesktop } = useResponsiveLayout();
  const [loadedOrder, setLoadedOrder] = useState<RideOrder>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const chat = useRideChat(id);
  const demoSession = token?.startsWith('demo:') ?? false;

  const loadOrder = useCallback(async () => {
    if (demoSession) return;
    if (!token) return;
    setLoading(true);
    try {
      setLoadedOrder(await apiRequest<RideOrder>(`/v1/orders/${id}`, { token }));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить заказ');
    } finally {
      setLoading(false);
    }
  }, [demoSession, id, token]);

  useEffect(() => {
    const timer = setTimeout(() => void loadOrder(), 0);
    return () => clearTimeout(timer);
  }, [loadOrder]);

  const order = demoSession ? demoOrders.find((item) => item.id === id) : loadedOrder;

  const destinations = useMemo(
    () => order?.destinations?.length ? order.destinations : order ? [order.destination] : [],
    [order],
  );

  if (loading && !demoSession && !order) {
    return (
      <Screen contentStyle={{ maxWidth: spacing.x12 * 20, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
        <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
          Загружаем заказ…
        </Text>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen contentStyle={{ maxWidth: spacing.x12 * 20 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/admin/orders')} />
        <Text accessibilityRole="header" style={{ ...typography.pageTitle, color: colors.ink }}>
          Заказ не найден
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.dangerText }}>
            {error}
          </Text>
        )}
        {!demoSession && (
          <AppButton variant="secondary" onPress={() => void loadOrder()} loading={loading}>
            Повторить загрузку
          </AppButton>
        )}
      </Screen>
    );
  }

  const rows: [string, string][] = [
    ['Тариф', tariffLabels[order.tariff]],
    ['Зона расчёта', pricingScopeLabel[order.pricingScope ?? 'intercity']],
    ['Оплата', paymentLabels[order.paymentMethod]],
    ['Расстояние', `${(order.distanceMeters / 1_000).toFixed(1).replace('.', ',')} км`],
    ['Расчётное время', formatDuration(Math.round(order.durationSeconds / 60))],
    ['Стоимость маршрута', formatMoney(order.basePriceMinor ?? order.priceMinor)],
    ...((order.searchPriceIncreaseMinor ?? 0) > 0
      ? [['Повышение цены', `+ ${formatMoney(order.searchPriceIncreaseMinor ?? 0)}`] as [string, string]]
      : []),
    ...(order.waitingSeconds || order.waitingPriceMinor
      ? [[
          `Ожидание · ${formatWaitingDuration(order.waitingSeconds ?? 0)}`,
          `+ ${formatMoney(order.waitingPriceMinor ?? 0)}`,
        ] as [string, string]]
      : []),
    ['Комиссия сервиса', formatMoney(order.serviceCommissionMinor)],
    ['Итого', formatMoney(order.priceMinor)],
    ['Создан', formatDateTime(order.createdAt)],
    ['Обновлён', formatDateTime(order.updatedAt)],
  ];

  return (
    <Screen contentStyle={{ maxWidth: spacing.x12 * 26 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="К списку заказов" onPress={() => goBackOrReplace('/admin/orders')} />
        <View style={{ flex: 1, minWidth: spacing.x12 * 4, gap: spacing.x1 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Детали заказа
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            № {order.id}
          </Text>
        </View>
        <StatusChip
          label={rideStatusLabel[order.status]}
          tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'info'}
        />
        <MoneyValue valueMinor={order.priceMinor} />
      </View>

      {!!error && (
        <View style={{ alignItems: 'flex-start', gap: spacing.x2 }}>
          <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.dangerText }}>
            {error}
          </Text>
          <AppButton
            compact
            fullWidth={false}
            variant="secondary"
            onPress={() => void loadOrder()}
            loading={loading}
          >
            Обновить данные
          </AppButton>
        </View>
      )}

      <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.x4 }}>
        <View style={{ flex: isDesktop ? 1.1 : undefined, width: '100%', gap: spacing.x4 }}>
          <SurfaceCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
              <AppIcon name="location" color={colors.infoText} />
              <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                Маршрут
              </Text>
            </View>
            <View style={{ gap: spacing.x3 }}>
              <View>
                <Text style={{ ...typography.micro, color: colors.inkSecondary }}>ОТКУДА</Text>
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {order.pickup.label}
                </Text>
                {!!order.pickup.details && (
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                    {order.pickup.details}
                  </Text>
                )}
              </View>
              {destinations.map((destination, index) => (
                <View key={`${destination.id}-${index}`} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.x3 }}>
                  <Text style={{ ...typography.micro, color: colors.inkSecondary }}>
                    {index === destinations.length - 1 ? 'КУДА' : `ОСТАНОВКА ${index + 1}`}
                  </Text>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                    {destination.label}
                  </Text>
                  {!!destination.details && (
                    <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                      {destination.details}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {!!order.comment && (
              <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.x3, gap: spacing.x1 }}>
                <Text style={{ ...typography.micro, color: colors.inkSecondary }}>КОММЕНТАРИЙ</Text>
                <Text selectable style={{ ...typography.body, color: colors.ink }}>{order.comment}</Text>
              </View>
            )}
          </SurfaceCard>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.x4 }}>
            <SurfaceCard style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
                <AppIcon name="profile" color={colors.infoText} />
                <Text accessibilityRole="header" style={{ ...typography.bodyStrong, color: colors.ink }}>
                  Пассажир
                </Text>
              </View>
              <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
                {order.passenger?.name ?? 'Не указан'}
              </Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
                {order.passenger?.phone ?? 'Телефон не указан'}
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                Рейтинг {order.passenger?.rating.toFixed(2) ?? '—'} · {order.passenger?.ratingCount ?? 0} оценок
              </Text>
            </SurfaceCard>
            <SurfaceCard style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
                <AppIcon name="car" color={colors.infoText} />
                <Text accessibilityRole="header" style={{ ...typography.bodyStrong, color: colors.ink }}>
                  Водитель
                </Text>
              </View>
              <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
                {order.driver?.name ?? 'Не назначен'}
              </Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
                {order.driver?.phone ?? 'Телефон не указан'}
              </Text>
              {order.driver && (
                <>
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                    Рейтинг {order.driver.rating.toFixed(2)} · {order.driver.ratingCount ?? 0} оценок
                  </Text>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                    {order.driver.vehicle.color} {order.driver.vehicle.make} {order.driver.vehicle.model}
                  </Text>
                  <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
                    Госномер {order.driver.vehicle.plate}
                  </Text>
                </>
              )}
            </SurfaceCard>
          </View>

          <SurfaceCard>
            <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
              Расчёт поездки
            </Text>
            <DetailRows rows={rows} />
          </SurfaceCard>
        </View>

        <SurfaceCard style={{ flex: isDesktop ? 0.9 : undefined, width: '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
            <AppIcon name="chat" color={colors.infoText} />
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                Чат пассажира и водителя
              </Text>
              <Text accessibilityRole="text" style={{ ...typography.caption, color: colors.inkSecondary }}>
                {chat.connected ? 'Обновляется в реальном времени' : 'Подключение к realtime…'}
              </Text>
            </View>
            <StatusChip label="Только просмотр" tone="neutral" />
          </View>

          {!!chat.thread?.participants?.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
              {chat.thread.participants.map((participant) => (
                <View key={participant.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
                  <RideChatAvatar participant={participant} size={spacing.x8} />
                  <View>
                    <Text selectable style={{ ...typography.caption, color: colors.ink }}>
                      {participant.name}
                    </Text>
                    <Text style={{ ...typography.micro, color: colors.inkSecondary }}>
                      {participant.role === 'driver' ? 'Водитель' : 'Пассажир'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {chat.loading ? (
            <View style={{ alignItems: 'center', padding: spacing.x8, gap: spacing.x3 }}>
              <ActivityIndicator color={colors.ink} />
              <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                Загружаем переписку…
              </Text>
            </View>
          ) : !order.driver ? (
            <View style={{ alignItems: 'center', padding: spacing.x8, gap: spacing.x3 }}>
              <AppIcon name="chat" size={spacing.x10} color={colors.inkMuted} />
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
                Чат появится после назначения водителя.
              </Text>
            </View>
          ) : chat.error && !chat.thread ? (
            <View style={{ alignItems: 'flex-start', gap: spacing.x3 }}>
              <Text accessibilityRole="alert" selectable style={{ ...typography.body, color: colors.dangerText }}>
                {chat.error}
              </Text>
              <AppButton
                compact
                fullWidth={false}
                variant="secondary"
                onPress={() => void chat.reload().catch(() => undefined)}
              >
                Повторить загрузку чата
              </AppButton>
            </View>
          ) : chat.thread?.messages.length ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ gap: spacing.x3 }}
            >
              {chat.thread.messages.map((message) => (
                <RideChatMessageRow key={message.id} message={message} adminView />
              ))}
            </View>
          ) : (
            <View style={{ alignItems: 'center', padding: spacing.x8, gap: spacing.x3 }}>
              <AppIcon name="chat" size={spacing.x10} color={colors.inkMuted} />
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                Сообщений пока нет
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
                Здесь появится история сообщений между пассажиром и водителем.
              </Text>
            </View>
          )}
        </SurfaceCard>
      </View>
    </Screen>
  );
}
