import { ScrollView, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/ui/surface-card';
import type { AdminActivityPoint } from '@/domain/models';
import { colors, layout, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  points: AdminActivityPoint[];
};

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

export function AdminActivityChart({ points }: Props) {
  const visiblePoints = points.slice(-14);
  const maximum = Math.max(
    1,
    ...visiblePoints.flatMap((point) => [point.completedOrders, point.cancelledOrders]),
  );

  return (
    <SurfaceCard>
      <View style={{ gap: spacing.x1 }}>
        <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
          Поездки за 14 дней
        </Text>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
          Выполненные и отменённые заказы по дням
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <View
            accessibilityElementsHidden
            style={{
              width: spacing.x3,
              height: spacing.x3,
              borderRadius: radius.sm,
              backgroundColor: colors.brand,
            }}
          />
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Выполнено</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
          <View
            accessibilityElementsHidden
            style={{
              width: spacing.x3,
              height: spacing.x3,
              borderRadius: radius.sm,
              backgroundColor: colors.danger,
            }}
          />
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Отменено</Text>
        </View>
      </View>
      {visiblePoints.length === 0 ? (
        <View
          accessibilityRole="summary"
          style={{ minHeight: layout.chartHeight, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ ...typography.body, color: colors.inkMuted }}>Поездок пока нет</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            accessibilityRole="summary"
            accessibilityLabel="График выполненных и отменённых поездок за последние 14 дней"
            style={{
              minHeight: layout.chartHeight + spacing.x8,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: spacing.x3,
            }}
          >
            {visiblePoints.map((point) => {
              const date = shortDate.format(new Date(`${point.date}T00:00:00Z`));
              return (
                <View
                  key={point.date}
                  accessible
                  accessibilityLabel={`${date}: выполнено ${point.completedOrders}, отменено ${point.cancelledOrders}`}
                  style={{ width: spacing.x10, alignItems: 'center', gap: spacing.x2 }}
                >
                  <View
                    style={{
                      height: layout.chartHeight,
                      width: '100%',
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      gap: spacing.x1,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        minHeight: spacing.x1,
                        height: Math.max(
                          spacing.x1,
                          (point.completedOrders / maximum) * layout.chartHeight,
                        ),
                        borderRadius: radius.sm,
                        backgroundColor: colors.brand,
                      }}
                    />
                    <View
                      style={{
                        flex: 1,
                        minHeight: spacing.x1,
                        height: Math.max(
                          spacing.x1,
                          (point.cancelledOrders / maximum) * layout.chartHeight,
                        ),
                        borderRadius: radius.sm,
                        backgroundColor: colors.danger,
                      }}
                    />
                  </View>
                  <Text style={{ ...typography.micro, color: colors.inkMuted }}>{date}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SurfaceCard>
  );
}
