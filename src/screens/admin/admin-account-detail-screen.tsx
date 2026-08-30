import { router } from 'expo-router';
import { Host, Switch } from '@expo/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AdminActivityChart } from '@/components/admin/admin-activity-chart';
import { KpiCard } from '@/components/admin/kpi-card';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import { demoDriver, demoOrders, demoPassenger } from '@/data/demo';
import {
  defaultDriverPriorities,
  driverPriorityScopeLabels,
  driverPriorityScopes,
  type DriverPriorities,
} from '@/domain/driver-priority';
import type {
  AdminAccountProfile,
  AdminAccountStats,
  AdminActivityPoint,
  AdminDriverDetail,
  AdminPassengerDetail,
  AdminRating,
  RideOrder,
} from '@/domain/models';
import { rideStatusLabel } from '@/domain/ride-state';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, opacity, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime, formatDuration, formatMoney } from '@/utils/format';

type Detail = AdminPassengerDetail | AdminDriverDetail;
type Section = 'overview' | 'orders' | 'ratings' | 'data';
type DialogAction = 'block' | 'unblock' | 'delete-rating' | null;

type Props = {
  id: string;
  kind: 'passenger' | 'driver';
};

const driverStatusLabels: Record<AdminDriverDetail['driver']['status'], string> = {
  online: 'На линии',
  offline: 'Не на линии',
  busy: 'В поездке',
  suspended: 'Приостановлен',
};

const consentLabels: Record<string, string> = {
  terms: 'Условия использования',
  privacy: 'Политика конфиденциальности',
  passenger_rules: 'Правила пассажира',
  personal_data_consent: 'Согласие на персональные данные',
  driver_terms: 'Условия для водителей',
  driver_data_consent: 'Согласие водителя на обработку данных',
};

function activityFromOrders(orders: RideOrder[]): AdminActivityPoint[] {
  const byDate = new Map<string, AdminActivityPoint>();
  for (const order of orders) {
    const date = order.createdAt.slice(0, 10);
    const current = byDate.get(date) ?? {
      date,
      completedOrders: 0,
      cancelledOrders: 0,
      grossMinor: 0,
    };
    if (order.status === 'completed') {
      current.completedOrders += 1;
      current.grossMinor += order.priceMinor;
    }
    if (order.status === 'cancelled') current.cancelledOrders += 1;
    byDate.set(date, current);
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function statsFromOrders(orders: RideOrder[], rating: number, ratingCount: number): AdminAccountStats {
  const completed = orders.filter((order) => order.status === 'completed');
  const grossMinor = completed.reduce((sum, order) => sum + order.priceMinor, 0);
  return {
    totalOrders: orders.length,
    completedOrders: completed.length,
    cancelledOrders: orders.filter((order) => order.status === 'cancelled').length,
    activeOrders: orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length,
    grossMinor,
    commissionMinor: completed.reduce((sum, order) => sum + order.serviceCommissionMinor, 0),
    averageOrderMinor: completed.length ? Math.round(grossMinor / completed.length) : 0,
    distanceMeters: completed.reduce((sum, order) => sum + order.distanceMeters, 0),
    rating,
    ratingCount,
    fiveStarRatings: ratingCount,
    firstOrderAt: orders.at(-1)?.createdAt,
    lastOrderAt: orders[0]?.createdAt,
  };
}

function demoProfile(kind: Props['kind']): AdminAccountProfile {
  const isDriver = kind === 'driver';
  return {
    id: isDriver ? 'demo-driver-user' : demoPassenger.id,
    name: isDriver ? demoDriver.name : demoPassenger.name,
    gender: 'male',
    phone: isDriver ? demoDriver.phone : demoPassenger.phone,
    profileComplete: true,
    roles: isDriver ? ['passenger', 'driver'] : ['passenger'],
    createdAt: demoOrders.at(-1)?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function demoDetail(kind: Props['kind']): Detail {
  const profile = demoProfile(kind);
  const rating = kind === 'driver' ? demoDriver.rating : demoPassenger.rating;
  const ratingCount = kind === 'driver' ? demoDriver.ratingCount ?? 0 : demoPassenger.ratingCount;
  const ratingItem: AdminRating = {
    id: 'demo-rating',
    orderId: demoOrders[0]?.id ?? 'demo-order',
    score: 5,
    raterRole: kind === 'driver' ? 'passenger' : 'driver',
    rater: kind === 'driver'
      ? { id: demoPassenger.id, name: demoPassenger.name }
      : { id: 'demo-driver-user', name: demoDriver.name },
    ratee: { id: profile.id, name: profile.name },
    createdAt: demoOrders[0]?.updatedAt ?? new Date().toISOString(),
  };
  const shared = {
    user: profile,
    stats: statsFromOrders(demoOrders, rating, ratingCount),
    activity: activityFromOrders(demoOrders),
    orders: demoOrders,
    ratings: [ratingItem],
    consents: [],
  };
  if (kind === 'passenger') return { kind, ...shared };
  return {
    kind,
    ...shared,
    driver: {
      id: demoDriver.id,
      status: 'online',
      commissionBps: 1200,
      hasChildSeat: true,
      priorities: defaultDriverPriorities,
      approvedAt: profile.createdAt,
      vehicle: { ...demoDriver.vehicle, year: 2021 },
    },
    shifts: [],
    vehicles: [
      {
        id: 'demo-vehicle',
        ...demoDriver.vehicle,
        year: 2021,
        active: true,
        createdAt: profile.createdAt,
      },
    ],
  };
}

function DetailRows({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <View style={{ gap: spacing.x3 }}>
      {rows.map(([label, value]) => (
        <View key={label} style={{ gap: spacing.x1 }}>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>{label.toUpperCase()}</Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{value || 'Не указано'}</Text>
        </View>
      ))}
    </View>
  );
}

function RatingStars({ score }: { score: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`Оценка ${score} из 5`}
      style={{ flexDirection: 'row', gap: spacing.x1 }}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <AppIcon
          key={star}
          name="star"
          size={spacing.x4}
          filled={star <= score}
          color={star <= score ? colors.warning : colors.inkMuted}
        />
      ))}
    </View>
  );
}

export function AdminAccountDetailScreen({ id, kind }: Props) {
  const { token } = useSession();
  const { isDesktop } = useResponsiveLayout();
  const demo = token?.startsWith('demo:') ?? false;
  const [detail, setDetail] = useState<Detail>();
  const [section, setSection] = useState<Section>('overview');
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [blockReason, setBlockReason] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [selectedRating, setSelectedRating] = useState<AdminRating>();
  const [commissionDraft, setCommissionDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const sectionTabRefs = useRef<Partial<Record<Section, View & { focus?: () => void }>>>({});

  const load = useCallback(async () => {
    if (demo) {
      const next = demoDetail(kind);
      setDetail(next);
      if (next.kind === 'driver') {
        setCommissionDraft(next.driver.commissionBps == null ? '' : String(next.driver.commissionBps / 100));
      }
      setLoading(false);
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      const next = await apiRequest<Detail>(`/v1/admin/${kind}s/${id}`, { token });
      setDetail(next);
      if (next.kind === 'driver') {
        setCommissionDraft(next.driver.commissionBps == null ? '' : String(next.driver.commissionBps / 100));
      }
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, [demo, id, kind, token]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const profileLabel = kind === 'driver' ? 'водителя' : 'пассажира';
  const sectionTabs = useMemo(
    () =>
      [
        ['overview', 'Обзор'],
        ['orders', `Заказы ${detail ? `· ${detail.orders.length}` : ''}`],
        ['ratings', `Оценки ${detail ? `· ${detail.ratings.length}` : ''}`],
        ['data', 'Данные'],
      ] as const,
    [detail],
  );

  const moveSectionFocus = (
    current: Section,
    event: { nativeEvent: { key?: string }; preventDefault: () => void },
  ) => {
    const order = sectionTabs.map(([value]) => value);
    const index = order.indexOf(current);
    const key = event.nativeEvent.key;
    const target =
      key === 'Home'
        ? order[0]
        : key === 'End'
          ? order.at(-1)
          : key === 'ArrowRight'
            ? order[(index + 1) % order.length]
            : key === 'ArrowLeft'
              ? order[(index - 1 + order.length) % order.length]
              : undefined;
    if (!target) return;
    event.preventDefault();
    setSection(target);
    setTimeout(() => sectionTabRefs.current[target]?.focus?.(), 0);
  };

  const resetDialog = () => {
    setDialogAction(null);
    setBlockReason('');
    setDeleteConfirmation('');
    setSelectedRating(undefined);
  };

  const closeDialog = () => {
    if (busy) return;
    resetDialog();
  };

  const changeBlock = async (blocked: boolean) => {
    if (!detail || (!demo && !token)) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!demo) {
        await apiRequest(`/v1/admin/users/${detail.user.id}/block`, {
          method: 'PATCH',
          token: token ?? undefined,
          body: JSON.stringify({ blocked, reason: blocked ? blockReason : undefined }),
        });
        await load();
      } else {
        setDetail((current) =>
          current
            ? {
                ...current,
                user: {
                  ...current.user,
                  blockedAt: blocked ? new Date().toISOString() : undefined,
                  blockReason: blocked ? blockReason : undefined,
                },
                ...(current.kind === 'driver'
                  ? { driver: { ...current.driver, status: blocked ? 'suspended' : 'offline' } }
                  : {}),
              }
            : current,
        );
      }
      resetDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось изменить доступ');
    } finally {
      setBusy(false);
    }
  };

  const clearOrderBlock = async () => {
    if (!detail || detail.kind !== 'passenger' || (!demo && !token)) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!demo) {
        await apiRequest(`/v1/admin/passengers/${detail.user.id}/order-block`, {
          method: 'DELETE',
          token: token ?? undefined,
        });
        await load();
      } else {
        setDetail((current) =>
          current?.kind === 'passenger'
            ? {
                ...current,
                user: {
                  ...current.user,
                  orderBlockedUntil: undefined,
                  orderBlockReason: undefined,
                },
              }
            : current,
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось снять ограничение');
    } finally {
      setBusy(false);
    }
  };

  const deleteRating = async () => {
    if (!selectedRating || (!demo && !token)) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!demo) {
        await apiRequest(`/v1/admin/ratings/${selectedRating.id}`, {
          method: 'DELETE',
          token: token ?? undefined,
        });
        await load();
      } else {
        setDetail((current) =>
          current
            ? { ...current, ratings: current.ratings.filter((rating) => rating.id !== selectedRating.id) }
            : current,
        );
      }
      resetDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить оценку');
    } finally {
      setBusy(false);
    }
  };

  const saveCommission = async (commissionBps: number | null) => {
    if (!detail || detail.kind !== 'driver' || (!demo && !token)) return;
    setBusy(true);
    try {
      if (!demo) {
        await apiRequest(`/v1/admin/drivers/${detail.driver.id}`, {
          method: 'PATCH',
          token: token ?? undefined,
          body: JSON.stringify({ commissionBps }),
        });
        await load();
      } else {
        setDetail((current) =>
          current?.kind === 'driver'
            ? { ...current, driver: { ...current.driver, commissionBps } }
            : current,
        );
        setCommissionDraft(commissionBps == null ? '' : String(commissionBps / 100));
      }
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить комиссию');
    } finally {
      setBusy(false);
    }
  };

  const savePriorities = async (priorities: DriverPriorities) => {
    if (!detail || detail.kind !== 'driver' || (!demo && !token)) return;
    setBusy(true);
    try {
      if (!demo) {
        await apiRequest(`/v1/admin/drivers/${detail.driver.id}`, {
          method: 'PATCH',
          token: token ?? undefined,
          body: JSON.stringify({ priorities }),
        });
        await load();
      } else {
        setDetail((current) =>
          current?.kind === 'driver'
            ? { ...current, driver: { ...current.driver, priorities } }
            : current,
        );
      }
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить приоритеты');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return (
      <Screen>
        <View accessibilityRole="progressbar" style={{ padding: spacing.x8 }}>
          <Text style={{ ...typography.body, color: colors.inkSecondary }}>Загружаем профиль…</Text>
        </View>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.dangerText }}>
          {error ?? 'Профиль не найден'}
        </Text>
      </Screen>
    );
  }

  const blocked = !!detail.user.blockedAt;
  const orderBlocked = !!detail.user.orderBlockedUntil;
  const status = blocked
    ? { label: 'Заблокирован', tone: 'danger' as const }
    : detail.kind === 'driver'
      ? {
          label: driverStatusLabels[detail.driver.status],
          tone:
            detail.driver.status === 'online'
              ? ('success' as const)
              : detail.driver.status === 'suspended'
                ? ('danger' as const)
                : ('neutral' as const),
        }
      : { label: 'Доступен', tone: 'success' as const };

  return (
    <>
      <Screen contentStyle={{ gap: spacing.x6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <IconButton icon="back" label="Назад к списку" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ ...typography.pageTitle, color: colors.ink }}>
              {detail.user.name}
            </Text>
            <Text style={{ ...typography.body, color: colors.inkSecondary }}>
              Профиль {profileLabel} · {detail.user.phone ?? 'телефон не указан'}
            </Text>
          </View>
          <StatusChip label={status.label} tone={status.tone} />
        </View>

        {!!error && (
          <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.dangerText }}>
            {error}
          </Text>
        )}

        <SurfaceCard
          style={{
            backgroundColor: blocked ? colors.dangerSoft : colors.surface,
            borderColor: blocked ? colors.danger : colors.border,
          }}
        >
          <View
            style={{
              flexDirection: isDesktop ? 'row' : 'column',
              alignItems: isDesktop ? 'center' : 'stretch',
              gap: spacing.x4,
            }}
          >
            <View
              style={{
                width: spacing.x12,
                height: spacing.x12,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: blocked ? colors.danger : colors.brand,
              }}
            >
              <AppIcon
                name={blocked ? 'ban' : kind === 'driver' ? 'car' : 'profile'}
                color={blocked ? colors.dangerInk : colors.brandInk}
              />
            </View>
            <View style={{ flex: 1, gap: spacing.x1 }}>
              <Text style={{ ...typography.sectionTitle, color: colors.ink }}>
                {blocked ? 'Доступ полностью закрыт' : 'Учётная запись активна'}
              </Text>
              <Text style={{ ...typography.body, color: blocked ? colors.dangerText : colors.inkSecondary }}>
                {blocked
                  ? detail.user.blockReason ?? 'Причина не указана'
                  : 'Пользователь может входить в приложение и работать со своими разделами.'}
              </Text>
              {!!detail.user.blockedByName && (
                <Text style={{ ...typography.caption, color: colors.inkMuted }}>
                  Заблокировал: {detail.user.blockedByName}
                </Text>
              )}
            </View>
            <AppButton
              fullWidth={!isDesktop}
              variant={blocked ? 'primary' : 'danger'}
              icon={<AppIcon name={blocked ? 'check' : 'ban'} color={blocked ? colors.brandInk : colors.dangerInk} />}
              onPress={() => setDialogAction(blocked ? 'unblock' : 'block')}
            >
              {blocked ? 'Вернуть доступ' : 'Заблокировать'}
            </AppButton>
          </View>
        </SurfaceCard>

        {detail.kind === 'passenger' && orderBlocked && (
          <SurfaceCard
            style={{
              backgroundColor: colors.warningSoft,
              borderColor: colors.warning,
            }}
          >
            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                alignItems: isDesktop ? 'center' : 'stretch',
                gap: spacing.x4,
              }}
            >
              <View style={{ flex: 1, gap: spacing.x1 }}>
                <Text style={{ ...typography.sectionTitle, color: colors.warningText }}>
                  Заказы временно заблокированы
                </Text>
                <Text style={{ ...typography.body, color: colors.inkSecondary }}>
                  {detail.user.orderBlockReason ?? 'Частые отмены заказов'} · до{' '}
                  {formatDateTime(detail.user.orderBlockedUntil!)}
                </Text>
              </View>
              <AppButton
                fullWidth={!isDesktop}
                loading={busy}
                icon={<AppIcon name="check" color={colors.brandInk} />}
                onPress={() => void clearOrderBlock()}
              >
                Разблокировать заказы
              </AppButton>
            </View>
          </SurfaceCard>
        )}

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
          {sectionTabs.map(([value, label]) => {
            const selected = section === value;
            return (
              <AnimatedPressable
                key={value}
                ref={(node) => {
                  sectionTabRefs.current[value] = node ?? undefined;
                }}
                nativeID={`account-detail-tab-${value}`}
                accessibilityRole="tab"
                aria-selected={selected}
                aria-controls={`account-detail-panel-${value}`}
                tabIndex={selected ? 0 : -1}
                accessibilityLabel={label}
                onPress={() => setSection(value)}
                onKeyDown={(event) => moveSectionFocus(value, event)}
                style={({ pressed }) => ({
                  minHeight: spacing.x12,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.x4,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.ink : colors.border,
                  backgroundColor: selected ? colors.ink : colors.surface,
                  opacity: pressed ? opacity.pressedSubtle : opacity.visible,
                })}
              >
                <Text style={{ ...typography.caption, color: selected ? colors.surface : colors.inkSecondary }}>
                  {label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {section === 'overview' && (
          <View
            nativeID="account-detail-panel-overview"
            role="tabpanel"
            aria-labelledby="account-detail-tab-overview"
            style={{ gap: spacing.x6 }}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
              <KpiCard
                label="Завершённые поездки"
                value={String(detail.stats.completedOrders)}
                hint={`Всего заказов: ${detail.stats.totalOrders}`}
                icon="orders"
              />
              <KpiCard
                label="Рейтинг"
                value={detail.stats.rating.toFixed(2)}
                hint={`${detail.stats.ratingCount} оценок, пятёрок: ${detail.stats.fiveStarRatings}`}
                icon="star"
              />
              <KpiCard
                label={detail.kind === 'driver' ? 'Оборот поездок' : 'Потрачено'}
                value={formatMoney(detail.stats.grossMinor)}
                hint={`Средний заказ: ${formatMoney(detail.stats.averageOrderMinor)}`}
                icon="earnings"
              />
              <KpiCard
                label="Пробег"
                value={`${Math.round(detail.stats.distanceMeters / 1000)} км`}
                hint={detail.stats.lastOrderAt ? `Последний заказ ${formatDateTime(detail.stats.lastOrderAt)}` : 'Заказов ещё нет'}
                icon="location"
              />
            </View>
            <AdminActivityChart points={detail.activity} />
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.x4 }}>
              <SurfaceCard style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                  Профиль
                </Text>
                <DetailRows
                  rows={[
                    ['ID пользователя', detail.user.id],
                    ['Имя', detail.user.name],
                    ['Телефон', detail.user.phone],
                    ['Пол', detail.user.gender === 'female' ? 'Женский' : detail.user.gender === 'male' ? 'Мужской' : undefined],
                    ['Роли', detail.user.roles.join(', ')],
                    ['Профиль создан', formatDateTime(detail.user.createdAt)],
                    ['Обновлён', formatDateTime(detail.user.updatedAt)],
                  ]}
                />
              </SurfaceCard>
              {detail.kind === 'driver' && (
                <SurfaceCard style={{ flex: 1 }}>
                  <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                    Водитель и автомобиль
                  </Text>
                  <DetailRows
                    rows={[
                      ['ID водителя', detail.driver.id],
                      ['Статус', driverStatusLabels[detail.driver.status]],
                      ['Допущен', formatDateTime(detail.driver.approvedAt)],
                      ['Автомобиль', detail.driver.vehicle ? `${detail.driver.vehicle.make} ${detail.driver.vehicle.model}, ${detail.driver.vehicle.year}` : undefined],
                      ['Цвет и госномер', detail.driver.vehicle ? `${detail.driver.vehicle.color}, ${detail.driver.vehicle.plate}` : undefined],
                      ['Детский тариф', detail.driver.hasChildSeat ? 'Доступен' : 'Недоступен'],
                      ['Время на линии', formatDuration(detail.stats.onlineMinutes ?? 0)],
                    ]}
                  />
                  <View style={{ gap: spacing.x2 }}>
                    <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
                      Приоритет получения заказов
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                      Включите зоны, в которых этот водитель будет получать новые заказы раньше
                      остальных.
                    </Text>
                    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
                      {driverPriorityScopes.map((scope) => (
                        <Switch
                          key={scope}
                          label={driverPriorityScopeLabels[scope]}
                          value={detail.driver.priorities[scope]}
                          disabled={busy}
                          onValueChange={(value) =>
                            void savePriorities({
                              ...detail.driver.priorities,
                              [scope]: value,
                            })
                          }
                        />
                      ))}
                    </Host>
                  </View>
                  <View style={{ gap: spacing.x2 }}>
                    <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                      Индивидуальная комиссия, %
                    </Text>
                    <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.x2 }}>
                      <TextInput
                        accessibilityLabel="Индивидуальная комиссия водителя, процентов"
                        value={commissionDraft}
                        onChangeText={(value) => setCommissionDraft(value.replace(/[^\d]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="По тарифу сервиса"
                        placeholderTextColor={colors.inkMuted}
                        style={{
                          ...typography.body,
                          flex: 1,
                          minHeight: spacing.x12,
                          color: colors.ink,
                          borderWidth: 1,
                          borderColor: colors.borderStrong,
                          borderRadius: radius.md,
                          paddingHorizontal: spacing.x4,
                        }}
                      />
                      <AppButton
                        fullWidth={!isDesktop}
                        variant="secondary"
                        loading={busy}
                        onPress={() =>
                          void saveCommission(Math.min(5000, Number(commissionDraft || 0) * 100))
                        }
                      >
                        Сохранить
                      </AppButton>
                      <AppButton
                        fullWidth={!isDesktop}
                        variant="quiet"
                        disabled={busy}
                        onPress={() => void saveCommission(null)}
                      >
                        По тарифу
                      </AppButton>
                    </View>
                  </View>
                </SurfaceCard>
              )}
            </View>
          </View>
        )}

        {section === 'orders' && (
          <View
            nativeID="account-detail-panel-orders"
            role="tabpanel"
            aria-labelledby="account-detail-tab-orders"
          >
          <SurfaceCard>
            <View style={{ gap: spacing.x1 }}>
              <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                Все заказы
              </Text>
              <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                Маршрут, статус, сумма и время каждого заказа
              </Text>
            </View>
            {detail.orders.length === 0 && (
              <Text style={{ ...typography.body, color: colors.inkMuted }}>Заказов пока нет</Text>
            )}
            {detail.orders.map((order, index) => (
              <View
                key={order.id}
                accessible
                accessibilityLabel={`${rideStatusLabel[order.status]}, ${order.pickup.label}, ${order.destination.label}, ${formatMoney(order.priceMinor)}`}
                style={{
                  minHeight: spacing.x12 * 2,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  alignContent: 'center',
                  gap: spacing.x3,
                  paddingVertical: spacing.x3,
                  borderTopWidth: index ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: spacing.x12 * 4, gap: spacing.x1 }}>
                  <Text style={{ ...typography.bodyStrong, color: colors.ink }}>{order.pickup.label}</Text>
                  <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                    {order.destination.label}
                  </Text>
                  <Text style={{ ...typography.micro, color: colors.inkMuted }}>
                    {formatDateTime(order.createdAt)} · {order.id}
                  </Text>
                </View>
                <StatusChip
                  label={rideStatusLabel[order.status]}
                  tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'info'}
                />
                <Text style={{ ...typography.bodyStrong, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                  {formatMoney(order.priceMinor)}
                </Text>
                <AppButton
                  fullWidth={false}
                  compact
                  variant="secondary"
                  onPress={() => router.push(`/admin/orders/${order.id}` as never)}
                >
                  Открыть заказ
                </AppButton>
              </View>
            ))}
          </SurfaceCard>
          </View>
        )}

        {section === 'ratings' && (
          <View
            nativeID="account-detail-panel-ratings"
            role="tabpanel"
            aria-labelledby="account-detail-tab-ratings"
          >
          <SurfaceCard>
            <View style={{ gap: spacing.x1 }}>
              <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                Все оценки
              </Text>
              <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                Видно, кто поставил оценку, кому и за какой заказ
              </Text>
            </View>
            {detail.ratings.length === 0 && (
              <Text style={{ ...typography.body, color: colors.inkMuted }}>Оценок пока нет</Text>
            )}
            {detail.ratings.map((rating, index) => {
              const received = rating.ratee.id === detail.user.id;
              return (
                <View
                  key={rating.id}
                  style={{
                    minHeight: spacing.x12 * 2,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    alignContent: 'center',
                    gap: spacing.x3,
                    paddingVertical: spacing.x3,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: spacing.x12 * 4, gap: spacing.x1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
                      <StatusChip label={received ? 'Получена' : 'Поставлена'} tone={received ? 'info' : 'neutral'} />
                      <RatingStars score={rating.score} />
                    </View>
                    <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
                      {rating.rater.name} → {rating.ratee.name}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                      Заказ {rating.orderId} · {formatDateTime(rating.createdAt)}
                    </Text>
                  </View>
                  <AppButton
                    fullWidth={false}
                    variant="danger"
                    icon={<AppIcon name="trash" color={colors.dangerInk} />}
                    onPress={() => {
                      setSelectedRating(rating);
                      setDialogAction('delete-rating');
                    }}
                  >
                    Удалить оценку
                  </AppButton>
                </View>
              );
            })}
          </SurfaceCard>
          </View>
        )}

        {section === 'data' && (
          <View
            nativeID="account-detail-panel-data"
            role="tabpanel"
            aria-labelledby="account-detail-tab-data"
            style={{ gap: spacing.x4 }}
          >
            {!!detail.user.orderBlockedUntil && (
              <SurfaceCard muted>
                <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.warningText }}>
                  Временное ограничение заказов
                </Text>
                <DetailRows
                  rows={[
                    ['До', formatDateTime(detail.user.orderBlockedUntil)],
                    ['Причина', detail.user.orderBlockReason],
                  ]}
                />
              </SurfaceCard>
            )}
            <SurfaceCard>
              <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                Юридические согласия
              </Text>
              {detail.consents.length === 0 && (
                <Text style={{ ...typography.body, color: colors.inkMuted }}>Записей о согласиях нет</Text>
              )}
              {detail.consents.map((consent, index) => (
                <View
                  key={`${consent.documentType}-${consent.documentVersion}-${consent.acceptedAt}`}
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    alignContent: 'center',
                    gap: spacing.x3,
                    paddingVertical: spacing.x3,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: spacing.x12 * 4 }}>
                    <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
                      {consentLabels[consent.documentType] ?? consent.documentType}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                      Версия {consent.documentVersion} · {consent.source}
                    </Text>
                  </View>
                  <Text style={{ ...typography.caption, color: colors.inkMuted }}>
                    {formatDateTime(consent.acceptedAt)}
                  </Text>
                  <StatusChip label={consent.revokedAt ? 'Отозвано' : 'Действует'} tone={consent.revokedAt ? 'danger' : 'success'} />
                </View>
              ))}
            </SurfaceCard>
            {detail.kind === 'driver' && (
              <>
                <SurfaceCard>
                  <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                    Автомобили
                  </Text>
                  {detail.vehicles.map((vehicle, index) => (
                    <View
                      key={vehicle.id}
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        alignContent: 'center',
                        gap: spacing.x3,
                        paddingVertical: spacing.x3,
                        borderTopWidth: index ? 1 : 0,
                        borderColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: spacing.x12 * 4 }}>
                        <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
                          {vehicle.color} {vehicle.make} {vehicle.model}, {vehicle.year}
                        </Text>
                        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                          {vehicle.plate} · добавлен {formatDateTime(vehicle.createdAt)}
                        </Text>
                      </View>
                      <StatusChip label={vehicle.active ? 'Активный' : 'Архив'} tone={vehicle.active ? 'success' : 'neutral'} />
                    </View>
                  ))}
                </SurfaceCard>
                <SurfaceCard>
                  <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                    Смены на линии
                  </Text>
                  {detail.shifts.length === 0 && (
                    <Text style={{ ...typography.body, color: colors.inkMuted }}>Смен пока нет</Text>
                  )}
                  {detail.shifts.map((shift, index) => (
                    <View
                      key={shift.id}
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        alignContent: 'center',
                        gap: spacing.x3,
                        paddingVertical: spacing.x3,
                        borderTopWidth: index ? 1 : 0,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>
                        {formatDateTime(shift.startedAt)}
                      </Text>
                      <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                        {formatDuration(shift.minutes)}
                      </Text>
                      <StatusChip label={shift.endedAt ? 'Завершена' : 'Идёт сейчас'} tone={shift.endedAt ? 'neutral' : 'success'} />
                    </View>
                  ))}
                </SurfaceCard>
              </>
            )}
          </View>
        )}
      </Screen>

      <AppModal
        visible={dialogAction !== null}
        title={
          dialogAction === 'block'
            ? `Заблокировать ${profileLabel}`
            : dialogAction === 'unblock'
              ? 'Вернуть доступ'
              : 'Удалить оценку'
        }
        description={
          dialogAction === 'block'
            ? 'Пользователь сразу увидит красный экран с указанной причиной. Все рабочие действия станут недоступны.'
            : dialogAction === 'unblock'
              ? 'Пользователь снова сможет работать в приложении.'
              : 'Оценка исчезнет из заказа, а общий рейтинг будет пересчитан. Это действие нельзя отменить.'
        }
        onClose={closeDialog}
      >
        {dialogAction === 'block' && (
          <View style={{ gap: spacing.x2 }}>
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Причина блокировки</Text>
            <TextInput
              autoFocus
              accessibilityLabel="Причина блокировки"
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              maxLength={500}
              placeholder="Например: систематическое нарушение правил сервиса"
              placeholderTextColor={colors.inkMuted}
              style={{
                ...typography.body,
                minHeight: spacing.x12 * 2,
                padding: spacing.x4,
                color: colors.ink,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                borderRadius: radius.md,
                textAlignVertical: 'top',
              }}
            />
          </View>
        )}
        {dialogAction === 'delete-rating' && (
          <View style={{ gap: spacing.x2 }}>
            {!!selectedRating && (
              <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
                {selectedRating.rater.name} → {selectedRating.ratee.name}, {selectedRating.score} из 5
              </Text>
            )}
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
              Введите УДАЛИТЬ для подтверждения
            </Text>
            <TextInput
              autoFocus
              accessibilityLabel="Введите УДАЛИТЬ для подтверждения"
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="characters"
              placeholder="УДАЛИТЬ"
              placeholderTextColor={colors.inkMuted}
              style={{
                ...typography.bodyStrong,
                minHeight: spacing.x12,
                paddingHorizontal: spacing.x4,
                color: colors.ink,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                borderRadius: radius.md,
              }}
            />
          </View>
        )}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column-reverse', gap: spacing.x3 }}>
          <AppButton fullWidth={!isDesktop} variant="secondary" disabled={busy} onPress={closeDialog}>
            Отмена
          </AppButton>
          {dialogAction === 'block' && (
            <AppButton
              fullWidth={!isDesktop}
              variant="danger"
              loading={busy}
              disabled={blockReason.trim().length < 3}
              onPress={() => void changeBlock(true)}
            >
              Заблокировать {profileLabel}
            </AppButton>
          )}
          {dialogAction === 'unblock' && (
            <AppButton fullWidth={!isDesktop} loading={busy} onPress={() => void changeBlock(false)}>
              Вернуть доступ
            </AppButton>
          )}
          {dialogAction === 'delete-rating' && (
            <AppButton
              fullWidth={!isDesktop}
              variant="danger"
              loading={busy}
              disabled={deleteConfirmation.trim().toLocaleUpperCase('ru-RU') !== 'УДАЛИТЬ'}
              onPress={() => void deleteRating()}
            >
              Удалить оценку
            </AppButton>
          )}
        </View>
      </AppModal>
    </>
  );
}
