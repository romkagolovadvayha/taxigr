import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';

type Device = { id: string; name: string; paired: boolean; lastSeenAt: string | null; revokedAt: string | null };
type State = { devices: Device[]; channels: string[] };
const channelLabels: Record<string, string> = { max: 'MAX', telegram: 'Telegram', vk: 'VK' };
export function GroupAlertsCard({ token, demo }: { token: string | null; demo: boolean }) {
  const colors = useThemeColors();
  const query = useQuery({ queryKey: ['admin-group-alerts', token], enabled: !!token && !demo,
    queryFn: ({ signal }) => apiRequest<State>('/v1/admin/group-alerts/devices', { token: token!, signal, cache: 'no-store' }),
  });
  const [maxGroups, setMaxGroups] = useState('Такси 🚖 Грахово');
  const [whatsappGroups, setWhatsappGroups] = useState('Грахово такси');
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); await query.refetch(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить подключение'); }
    finally { setBusy(false); }
  };
  const create = () => perform(async () => {
    const groups = (['max', 'whatsapp'] as const).flatMap(provider =>
      (provider === 'max' ? maxGroups : whatsappGroups).split('\n').map(title => title.trim()).filter(Boolean).map(title => ({ provider, title })));
    if (!groups.length) throw new Error('Укажите хотя бы одну группу');
    const result = await apiRequest<{ code: string; expiresAt: string }>('/v1/admin/group-alerts/devices', {
      method: 'POST', token: token!, body: JSON.stringify({ name: 'Заявки из групп', groups }),
    });
    setPairing(result);
  });
  const inputStyle = { color: colors.ink, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.x4, minHeight: 72, ...typography.body };
  return <SurfaceCard>
    <Text style={{ ...typography.sectionTitle, color: colors.ink }}>Сообщения из групп</Text>
    <Text style={{ ...typography.body, color: colors.inkSecondary }}>
      Подключение через ваши аккаунты передаёт новые сообщения со словом «кто» и просьбы вызвать такси из выбранных групп. Уведомления приходят только вам в боты, включённые в вашем профиле.
    </Text>
    {demo ? <Text>Подключение доступно после входа администратора.</Text> : query.data ? <>
      <Text style={{ color: colors.inkSecondary }}>Подтвердите вход в WhatsApp и MAX в окне «Заявки из групп» на компьютере, затем введите там код подключения.</Text>
      <Text style={{ color: colors.inkSecondary }}>Ваши боты: {query.data.channels.map(channel => channelLabels[channel] ?? channel).join(', ') || 'не подключены'}</Text>
      <Text style={{ color: colors.ink }}>Группы MAX — каждое название с новой строки</Text>
      <TextInput accessibilityLabel="Названия групп MAX" value={maxGroups} onChangeText={setMaxGroups} multiline
        maxLength={3000} editable={!busy} style={inputStyle} />
      <Text style={{ color: colors.ink }}>Группы WhatsApp — каждое название с новой строки</Text>
      <TextInput accessibilityLabel="Названия групп WhatsApp" value={whatsappGroups} onChangeText={setWhatsappGroups} multiline
        maxLength={3000} editable={!busy} style={inputStyle} />
      <Text style={{ color: colors.inkSecondary }}>Укажите названия точно как в списке чатов. После подключения группы закрепляются по их ID.</Text>
      <AppButton loading={busy} disabled={!query.data.channels.length} onPress={() => void create()}>Получить код подключения</AppButton>
      {pairing && <View style={{ gap: spacing.x1 }}>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>{pairing.code}</Text>
        <Text style={{ color: colors.inkSecondary }}>Введите код в окне «Заявки из групп» до {new Date(pairing.expiresAt).toLocaleTimeString('ru-RU')}.</Text>
      </View>}
      {!query.data.devices.length && <Text style={{ color: colors.inkSecondary }}>Источник сообщений ещё не подключён.</Text>}
      {query.data.devices.map(device => <View key={device.id} style={{ gap: spacing.x1 }}>
        <Text style={{ color: colors.ink }}>{device.name}: {device.revokedAt ? 'отключён' : device.paired ? 'подключён' : 'ожидает ввода кода'}</Text>
        {!!device.lastSeenAt && <Text style={{ color: colors.inkSecondary }}>Последнее сообщение: {new Date(device.lastSeenAt).toLocaleString('ru-RU')}</Text>}
        {!device.revokedAt && <AppButton variant="secondary" disabled={busy} onPress={() => void perform(async () => {
          await apiRequest(`/v1/admin/group-alerts/devices/${device.id}`, { method: 'DELETE', token: token! });
          setPairing(null);
        })}>Отключить устройство</AppButton>}
      </View>)}
    </> : <Text style={{ color: colors.inkSecondary }}>{query.error ? 'Не удалось загрузить подключения' : 'Загружаем подключения…'}</Text>}
    {!!query.error && <AppButton variant="secondary" onPress={() => void query.refetch()}>Повторить загрузку</AppButton>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
  </SurfaceCard>;
}
