import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { MoneyValue } from '@/components/ui/money-value';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import { VehicleIllustration } from '@/components/vehicle/vehicle-illustration';
import type { PricingRules } from '@/domain/pricing';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type AdminDriver = {
  id: string;
  status: 'online' | 'offline' | 'busy' | 'suspended';
  rating: number;
  commissionBps: number | null;
  hasChildSeat: boolean;
  name: string;
  phone: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  colorHex: string | null;
  plate: string | null;
  grossTodayMinor: number;
  ridesToday: number;
};

const demoDrivers: AdminDriver[] = [
  {
    id: 'demo-driver',
    status: 'online',
    rating: 4.94,
    commissionBps: 1200,
    hasChildSeat: true,
    name: 'Алексей Водитель',
    phone: '+7 912 000-00-02',
    make: 'Lada',
    model: 'Vesta',
    year: 2021,
    color: 'Белый',
    colorHex: '#F7F7F2',
    plate: 'А123АА 18',
    grossTodayMinor: 486_000,
    ridesToday: 9,
  },
];

export function DriversScreen() {
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [draftCommission, setDraftCommission] = useState<Record<string, string>>({});
  const [defaultCommissionBps, setDefaultCommissionBps] = useState(1200);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demo) {
      setDrivers(demoDrivers);
      return;
    }
    if (!token) return;
    try {
      const [items, tariffs] = await Promise.all([
        apiRequest<AdminDriver[]>('/v1/admin/drivers', { token }),
        apiRequest<PricingRules>('/v1/admin/tariffs', { token }),
      ]);
      setDrivers(items);
      setDefaultCommissionBps(tariffs.serviceCommissionBps);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить водителей');
    }
  }, [demo, token]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const update = async (driver: AdminDriver, patch: { status?: string; commissionBps?: number | null }) => {
    if (demo || !token) {
      setDrivers((items) => items.map((item) => (item.id === driver.id ? { ...item, ...patch } as AdminDriver : item)));
      return;
    }
    setBusyId(driver.id);
    try {
      await apiRequest(`/v1/admin/drivers/${driver.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(patch),
      });
      await load();
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось изменить водителя');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing.x6, gap: spacing.x5 }}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Водители</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>Допуск, личная комиссия и показатели</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ gap: spacing.x3 }}>
        {drivers.map((driver) => {
          const commission =
            draftCommission[driver.id] ??
            String((driver.commissionBps ?? defaultCommissionBps) / 100);
          return (
            <SurfaceCard key={driver.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x4, flexWrap: 'wrap' }}>
                <VehicleIllustration colorHex={driver.colorHex} width={72} height={38} framed />
                <View style={{ flex: 1, minWidth: 220 }}>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{driver.name}</Text>
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                    {[driver.color, driver.make, driver.model].filter(Boolean).join(' ')} · {driver.plate}
                  </Text>
                  <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
                    {driver.phone} · рейтинг {Number(driver.rating).toFixed(2)}
                    {driver.hasChildSeat ? ' · детский тариф' : ''}
                  </Text>
                </View>
                <StatusChip
                  label={
                    driver.status === 'online'
                      ? 'На линии'
                      : driver.status === 'busy'
                        ? 'В поездке'
                        : driver.status === 'offline'
                          ? 'Не на линии'
                          : 'Доступ приостановлен'
                  }
                  tone={driver.status === 'online' ? 'success' : driver.status === 'suspended' ? 'danger' : 'neutral'}
                />
                <View style={{ width: 116 }}>
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Комиссия</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.x2 }}>
                    <TextInput
                      value={commission}
                      accessibilityLabel={`Комиссия для ${driver.name}, процентов`}
                      onChangeText={(value) => setDraftCommission((current) => ({ ...current, [driver.id]: value.replace(/[^\d]/g, '') }))}
                      keyboardType="number-pad"
                      style={{ ...typography.bodyStrong, color: colors.ink, flex: 1, minHeight: 38 }}
                    />
                    <Text>%</Text>
                  </View>
                </View>
                <View style={{ minWidth: 120 }}>
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Сегодня</Text>
                  <MoneyValue valueMinor={Number(driver.grossTodayMinor)} compact />
                  <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>{Number(driver.ridesToday)} поездок</Text>
                </View>
                <AppButton
                  fullWidth={false}
                  variant="secondary"
                  disabled={busyId === driver.id}
                  onPress={() => void update(driver, { commissionBps: Math.min(5000, Number(commission || 0) * 100) })}
                >
                  Сохранить %
                </AppButton>
                <AppButton
                  fullWidth={false}
                  variant="quiet"
                  disabled={busyId === driver.id}
                  onPress={() => {
                    setDraftCommission((current) => {
                      const next = { ...current };
                      delete next[driver.id];
                      return next;
                    });
                    void update(driver, { commissionBps: null });
                  }}
                >
                  По умолчанию
                </AppButton>
                <AppButton
                  fullWidth={false}
                  variant={driver.status === 'suspended' ? 'primary' : 'danger'}
                  loading={busyId === driver.id}
                  onPress={() => void update(driver, { status: driver.status === 'suspended' ? 'offline' : 'suspended' })}
                >
                  {driver.status === 'suspended' ? 'Вернуть доступ' : 'Приостановить'}
                </AppButton>
              </View>
            </SurfaceCard>
          );
        })}
      </View>
    </ScrollView>
  );
}
