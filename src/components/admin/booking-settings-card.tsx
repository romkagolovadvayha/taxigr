import { Host, Switch } from '@expo/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text } from 'react-native';

import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { SurfaceCard } from '@/components/ui/surface-card';
import type { BookingAvailability } from '@/domain/booking-availability';
import { bookingAvailabilityQueryKey } from '@/providers/booking-availability-provider';
import { useThemeColors } from '@/theme/theme-provider';
import { typography } from '@/theme/tokens';

export function BookingSettingsCard({ token, demo }: { token: string | null; demo: boolean }) {
  const colors = useThemeColors();
  const client = useQueryClient();
  const queryKey = ['admin-booking-settings', token] as const;
  const query = useQuery({ queryKey, enabled: !!token && !demo, staleTime: 0,
    queryFn: ({ signal }) => apiRequest<BookingAvailability>('/v1/admin/booking-settings', { token: token!, signal, cache: 'no-store' }),
  });
  const [draft, setDraft] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const loaded = demo || query.data !== undefined;
  const enabled = draft ?? query.data?.enabled ?? false;
  const save = async () => {
    if (!loaded || busy || (!demo && !token)) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const settings = demo ? { enabled } : await apiRequest<BookingAvailability>('/v1/admin/booking-settings', {
        method: 'PUT', token: token!, body: JSON.stringify({ enabled }),
      });
      client.setQueryData(queryKey, settings);
      if (!demo) client.setQueryData(bookingAvailabilityQueryKey, settings);
      setDraft(null); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройку'); }
    finally { setBusy(false); }
  };
  return (
    <SurfaceCard>
      <Text style={{ ...typography.sectionTitle, color: colors.ink }}>Приём заказов такси</Text>
      {loaded ? <>
        <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
          <Switch label="Заказ такси включён" value={enabled} disabled={busy}
            onValueChange={(value) => { setDraft(value); setSaved(false); }} />
        </Host>
        <Text style={{ ...typography.body, color: colors.inkSecondary }}>
          При выключенном флажке вместо заказа открывается сообщение о наборе водителей с кнопкой «Стать водителем». Текущие поездки продолжаются.
        </Text>
        <AppButton loading={busy} onPress={() => void save()}>Сохранить приём заказов</AppButton>
      </> : <Text style={{ ...typography.body, color: colors.inkSecondary }}>{query.error ? 'Не удалось загрузить настройку' : 'Загружаем настройку…'}</Text>}
      {!!query.error && <AppButton variant="secondary" onPress={() => void query.refetch()}>Повторить загрузку</AppButton>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
      {saved && <Text accessibilityLiveRegion="polite" style={{ color: colors.inkSecondary }}>Сохранено. Приём заказов {enabled ? 'включён' : 'выключен'}.</Text>}
    </SurfaceCard>
  );
}
