import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { driverPriorityScopeLabels, driverPriorityScopes } from '@/domain/driver-priority';
import type { AdminAccountSummary } from '@/domain/models';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, opacity, radius, spacing, typography } from '@/theme/tokens';
import { formatMoney } from '@/utils/format';

type Filter = 'all' | 'available' | 'blocked';

type Props = {
  kind: 'passengers' | 'drivers';
  title: string;
  subtitle: string;
  items: AdminAccountSummary[];
  loading: boolean;
  error?: string;
};

const driverStatusLabels: Record<NonNullable<AdminAccountSummary['driverStatus']>, string> = {
  online: 'На линии',
  offline: 'Не на линии',
  busy: 'В поездке',
  suspended: 'Приостановлен',
};

export function AdminAccountsList({ kind, title, subtitle, items, loading, error }: Props) {
  const { isDesktop } = useResponsiveLayout();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const filterRefs = useRef<Partial<Record<Filter, View & { focus?: () => void }>>>({});
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    return items.filter((item) => {
      const matchesQuery =
        !normalized ||
        item.name.toLocaleLowerCase('ru-RU').includes(normalized) ||
        item.phone?.includes(normalized) ||
        item.vehicle?.plate.toLocaleLowerCase('ru-RU').includes(normalized);
      const matchesFilter =
        filter === 'all' || (filter === 'blocked' ? !!item.blockedAt : !item.blockedAt);
      return matchesQuery && matchesFilter;
    });
  }, [filter, items, query]);

  const moveFilterFocus = (
    current: Filter,
    event: { nativeEvent: { key?: string }; preventDefault: () => void },
  ) => {
    const order: Filter[] = ['all', 'available', 'blocked'];
    const index = order.indexOf(current);
    const key = event.nativeEvent.key;
    const target =
      key === 'Home'
        ? order[0]
        : key === 'End'
          ? order.at(-1)
          : key === 'ArrowRight' || key === 'ArrowDown'
            ? order[(index + 1) % order.length]
            : key === 'ArrowLeft' || key === 'ArrowUp'
              ? order[(index - 1 + order.length) % order.length]
              : undefined;
    if (!target) return;
    event.preventDefault();
    setFilter(target);
    setTimeout(() => filterRefs.current[target]?.focus?.(), 0);
  };

  return (
    <Screen contentStyle={{ gap: spacing.x6 }}>
      <View style={{ gap: spacing.x2 }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          {title}
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{subtitle}</Text>
      </View>

      <View
        style={{
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? 'center' : 'stretch',
          gap: spacing.x3,
        }}
      >
        <View
          style={{
            flex: 1,
            minHeight: spacing.x12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            paddingHorizontal: spacing.x4,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
          }}
        >
          <AppIcon name="search" color={colors.inkSecondary} />
          <TextInput
            accessibilityLabel={`Поиск, ${kind === 'drivers' ? 'водители' : 'пассажиры'}`}
            value={query}
            onChangeText={setQuery}
            placeholder="Имя, телефон или госномер"
            placeholderTextColor={colors.inkMuted}
            style={{ ...typography.body, flex: 1, color: colors.ink, minHeight: spacing.x12 }}
          />
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Фильтр доступа" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
          {(
            [
              ['all', 'Все'],
              ['available', 'Доступны'],
              ['blocked', 'Заблокированы'],
            ] as const
          ).map(([value, label]) => {
            const selected = filter === value;
            return (
              <AnimatedPressable
                key={value}
                ref={(node) => {
                  filterRefs.current[value] = node ?? undefined;
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                tabIndex={selected ? 0 : -1}
                accessibilityLabel={label}
                onPress={() => setFilter(value)}
                onKeyDown={(event) => moveFilterFocus(value, event)}
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
                <Text
                  style={{
                    ...typography.caption,
                    color: selected ? colors.surface : colors.inkSecondary,
                  }}
                >
                  {label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>

      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.body, color: colors.dangerText }}>
          {error}
        </Text>
      )}

      <View
        accessibilityLiveRegion="polite"
        style={{
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        }}
      >
        {loading && (
          <View accessibilityRole="progressbar" style={{ padding: spacing.x6 }}>
            <Text style={{ ...typography.body, color: colors.inkSecondary }}>Загружаем список…</Text>
          </View>
        )}
        {!loading && filtered.length === 0 && (
          <View style={{ minHeight: spacing.x12 * 3, alignItems: 'center', justifyContent: 'center', gap: spacing.x2 }}>
            <AppIcon name="users" color={colors.inkMuted} size={spacing.x8} />
            <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Ничего не найдено</Text>
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
              Измените запрос или фильтр
            </Text>
          </View>
        )}
        {!loading &&
          filtered.map((item, index) => {
            const status = item.blockedAt
              ? { label: 'Заблокирован', tone: 'danger' as const }
              : item.driverStatus
                ? {
                    label: driverStatusLabels[item.driverStatus],
                    tone:
                      item.driverStatus === 'online'
                        ? ('success' as const)
                        : item.driverStatus === 'suspended'
                          ? ('danger' as const)
                          : ('neutral' as const),
                  }
                : { label: 'Доступен', tone: 'success' as const };
            return (
              <AnimatedPressable
                key={item.id}
                feedback="subtle"
                accessibilityRole="button"
                accessibilityLabel={`Открыть профиль: ${item.name}`}
                onPress={() => router.push(`/admin/${kind}/${item.id}` as never)}
                style={({ pressed, hovered }) => ({
                  minHeight: spacing.x12 * 2,
                  padding: spacing.x4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignContent: 'center',
                  flexWrap: 'wrap',
                  gap: spacing.x4,
                  borderTopWidth: index ? 1 : 0,
                  borderColor: colors.border,
                  backgroundColor: hovered ? colors.surfaceSecondary : colors.surface,
                  opacity: pressed ? opacity.pressed : opacity.visible,
                })}
              >
                <View
                  style={{
                    width: spacing.x12,
                    height: spacing.x12,
                    borderRadius: radius.pill,
                    backgroundColor: item.blockedAt ? colors.dangerSoft : colors.brandSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name={kind === 'drivers' ? 'car' : 'profile'}
                    color={item.blockedAt ? colors.dangerText : colors.ink}
                  />
                </View>
                <View style={{ flex: 1, minWidth: spacing.x12 * 4, gap: spacing.x1 }}>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{item.name}</Text>
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                    {item.phone ?? 'Телефон не указан'}
                    {item.vehicle ? ` · ${item.vehicle.make} ${item.vehicle.model} · ${item.vehicle.plate}` : ''}
                  </Text>
                  {kind === 'drivers' && item.priorities && (
                    <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
                      Приоритет:{' '}
                      {driverPriorityScopes
                        .filter((scope) => item.priorities?.[scope])
                        .map((scope) => driverPriorityScopeLabels[scope])
                        .join(' · ') || 'не назначен'}
                    </Text>
                  )}
                  {!!item.blockReason && (
                    <Text numberOfLines={1} style={{ ...typography.caption, color: colors.dangerText }}>
                      {item.blockReason}
                    </Text>
                  )}
                </View>
                <StatusChip label={status.label} tone={status.tone} />
                <View style={{ minWidth: spacing.x12 * 2, gap: spacing.x1 }}>
                  <Text style={{ ...typography.micro, color: colors.inkMuted }}>РЕЙТИНГ</Text>
                  <Text style={{ ...typography.bodyStrong, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    {item.rating.toFixed(2)} · {item.ratingCount}
                  </Text>
                </View>
                <View style={{ minWidth: spacing.x12 * 2, gap: spacing.x1 }}>
                  <Text style={{ ...typography.micro, color: colors.inkMuted }}>ПОЕЗДКИ</Text>
                  <Text style={{ ...typography.bodyStrong, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    {item.completedOrders} из {item.totalOrders}
                  </Text>
                </View>
                <View style={{ minWidth: spacing.x12 * 2, gap: spacing.x1 }}>
                  <Text style={{ ...typography.micro, color: colors.inkMuted }}>ОБОРОТ</Text>
                  <Text style={{ ...typography.bodyStrong, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    {formatMoney(item.grossMinor)}
                  </Text>
                </View>
                <AppIcon name="chevron" color={colors.inkMuted} />
              </AnimatedPressable>
            );
          })}
      </View>
    </Screen>
  );
}
