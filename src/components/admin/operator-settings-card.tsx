import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { SurfaceCard } from '@/components/ui/surface-card';
import { operatorDetailsSchema, type OperatorDetails } from '@/domain/operator-details';
import { defaultOperatorDetails } from '@/legal/operator';
import { operatorDetailsQueryKey } from '@/legal/use-operator-details';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

const endpoint = '/v1/admin/operator-details';
const fields: { key: keyof OperatorDetails; label: string; placeholder?: string;
  maxLength: number; keyboardType?: KeyboardTypeOptions }[] = [
  { key: 'legalName', label: 'ИП / наименование оператора', placeholder: 'ИП Фамилия Имя Отчество', maxLength: 250 },
  { key: 'inn', label: 'ИНН', placeholder: '12 цифр для ИП', maxLength: 12, keyboardType: 'number-pad' },
  { key: 'registrationNumber', label: 'ОГРНИП / ОГРН', placeholder: '15 цифр для ИП', maxLength: 15, keyboardType: 'number-pad' },
  { key: 'status', label: 'Правовой статус', placeholder: 'ИП', maxLength: 100 },
  { key: 'address', label: 'Адрес регистрации', maxLength: 1000 },
  { key: 'email', label: 'Email для обращений', maxLength: 254, keyboardType: 'email-address' },
  { key: 'phone', label: 'Контактный телефон', placeholder: '+7', maxLength: 50, keyboardType: 'phone-pad' },
  { key: 'taxiRegistryNumber', label: 'Номер записи в реестре служб заказа такси', maxLength: 100 },
];

export function OperatorSettingsCard({ token, demo }: { token: string | null; demo: boolean }) {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const queryKey = ['admin-operator-details', token] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiRequest<OperatorDetails>(endpoint, { token: token!, signal }),
    enabled: !demo && !!token,
    staleTime: 0,
  });
  const [draft, setDraft] = useState<OperatorDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const settings = draft ?? query.data ?? defaultOperatorDetails;
  const loaded = demo || query.data !== undefined;

  const save = async () => {
    if (busy || !loaded || (!demo && !token)) return;
    setError(null);
    setMessage(null);
    const parsed = operatorDetailsSchema.safeParse(settings);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('. '));
      return;
    }
    if (demo) {
      setMessage('Демо: реквизиты не отправляются на сервер');
      return;
    }
    setBusy(true);
    try {
      const next = await apiRequest<OperatorDetails>(endpoint, {
        method: 'PUT', token: token!, body: JSON.stringify(parsed.data),
      });
      await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: operatorDetailsQueryKey });
      queryClient.setQueryData(queryKey, next);
      queryClient.setQueryData(operatorDetailsQueryKey, next);
      setDraft(null);
      setMessage('Реквизиты сохранены и опубликованы на сайте');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить реквизиты');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard>
      <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Реквизиты ИП</Text>
      <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
        ИП и ИНН отображаются внизу главной страницы. Эти же реквизиты и контакты используются
        в правовой информации и документах сервиса.
      </Text>
      {!loaded && !query.error && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          {query.fetchStatus === 'paused' ? 'Нет соединения. Подключитесь к интернету для загрузки реквизитов.' : 'Загрузка реквизитов…'}
        </Text>
      )}
      {!!query.error && (
        <View style={{ gap: spacing.x2 }}>
          <Text selectable accessibilityRole="alert" style={{ color: colors.danger }}>
            Не удалось загрузить реквизиты. {query.error.message}
          </Text>
          <AppButton variant="secondary" fullWidth={false} loading={query.isFetching} onPress={() => void query.refetch()}>
            Повторить загрузку
          </AppButton>
        </View>
      )}
      {loaded && !settings.legalName && !settings.inn && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Реквизиты ещё не заполнены. Укажите данные вашего ИП и сохраните их.
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x4 }}>
        {fields.map(({ key, label, placeholder, maxLength, keyboardType }) => (
          <View key={key} style={{ flex: 1, minWidth: 220, gap: spacing.x2 }}>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
            <TextInput
              accessibilityLabel={label}
              value={loaded ? settings[key] : ''}
              onChangeText={(value) => {
                setDraft({ ...settings, [key]: value });
                setMessage(null);
                setError(null);
              }}
              editable={loaded && !busy}
              keyboardType={keyboardType}
              maxLength={maxLength}
              autoCorrect={false}
              autoCapitalize="none"
              placeholder={placeholder}
              placeholderTextColor={colors.inkMuted}
              style={{ ...typography.body, color: colors.ink, backgroundColor: colors.surface,
                borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
                paddingHorizontal: spacing.x4, minHeight: 56 }}
            />
          </View>
        ))}
      </View>
      {!!error && <Text selectable accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
      {!!message && <Text selectable accessibilityLiveRegion="polite" style={{ ...typography.caption, color: colors.ink }}>{message}</Text>}
      <AppButton fullWidth={false} disabled={!loaded || (!demo && !token)} loading={busy} onPress={() => void save()}>
        Сохранить реквизиты
      </AppButton>
    </SurfaceCard>
  );
}
