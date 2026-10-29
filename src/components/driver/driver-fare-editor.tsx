import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { useRide } from '@/state/ride-provider';
import type { RideOrder } from '@/domain/models';
import { isRidePricePending } from '@/domain/ride-price';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { AppButton } from '@/components/ui/app-button';

export function DriverFareEditor({ ride }: { ride: RideOrder }) {
  const colors = useThemeColors();
  const { token } = useSession();
  const { refresh } = useRide();
  const [value, setValue] = useState(isRidePricePending(ride) ? '' : String(ride.priceMinor / 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const normalized = value.trim().replace(',', '.');
    const priceMinor = Math.round(Number(normalized) * 100);
    if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized) || priceMinor < 100 || priceMinor > 10_000_000) {
      setError('Введите сумму от 1 до 100 000 рублей.'); return;
    }
    setSaving(true); setError(null);
    try {
      await apiRequest(`/v1/driver/orders/${ride.id}/fare`, { method: 'POST', token: token ?? undefined, body: JSON.stringify({ priceMinor }) });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить стоимость. Повторите попытку.');
    } finally { setSaving(false); }
  };
  return <View style={{ gap: spacing.x2, padding: spacing.x3, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg }}>
    <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Стоимость по договорённости</Text>
    <Text style={{ ...typography.body, color: colors.inkSecondary }}>
      Уточните адрес и согласуйте сумму с пассажиром. Сохранённую стоимость он получит в уведомлении.
    </Text>
    <TextInput accessibilityLabel="Согласованная стоимость в рублях" placeholder="Сумма, ₽" keyboardType="decimal-pad"
      value={value} onChangeText={setValue} editable={!saving} maxLength={10}
      placeholderTextColor={colors.inkSecondary}
      style={{ ...typography.body, color: colors.ink, backgroundColor: colors.surface, padding: spacing.x3, borderRadius: radius.md }}/>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <AppButton compact loading={saving} disabled={saving || !value.trim()} onPress={() => void save()}>Сохранить стоимость</AppButton>
  </View>;
}
