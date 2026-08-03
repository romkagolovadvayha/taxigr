import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import { defaultPricingRules, type PricingRules } from '@/domain/pricing';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type EditableKey =
  | 'serviceCommissionBps'
  | 'fare07To22Minor'
  | 'fare22To02Minor'
  | 'fare02To07Minor'
  | 'childSurchargeMinor'
  | 'waitingFreeMinutes'
  | 'waitingPerMinuteMinor';

export function AdminSettingsScreen() {
  const { token, signOut } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [rules, setRules] = useState<PricingRules>(defaultPricingRules);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo || !token) return;
    const controller = new AbortController();
    void apiRequest<PricingRules>('/v1/admin/tariffs', { token, signal: controller.signal })
      .then(setRules)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить тарифы');
        }
      });
    return () => controller.abort();
  }, [demo, token]);

  const changeRubles = (key: EditableKey, value: string) => {
    const rubles = Number(value.replace(/[^\d]/g, '')) || 0;
    setRules((current) => ({ ...current, [key]: rubles * 100 }));
    setSaved(false);
  };

  const changeInteger = (key: EditableKey, value: string, multiplier = 1) => {
    const amount = Number(value.replace(/[^\d]/g, '')) || 0;
    setRules((current) => ({ ...current, [key]: amount * multiplier }));
    setSaved(false);
  };

  const save = async () => {
    if (demo || !token) {
      setSaved(true);
      return;
    }
    setBusy(true);
    try {
      const updated = await apiRequest<PricingRules>('/v1/admin/tariffs', {
        method: 'PUT',
        token,
        body: JSON.stringify(rules),
      });
      setRules(updated);
      setSaved(true);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить тарифы');
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    suffix: string,
  ) => (
    <View style={{ gap: spacing.x2, flex: 1, minWidth: 220 }}>
      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
      <View
        style={{
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.x4,
        }}
      >
        <TextInput
          value={value}
          accessibilityLabel={label}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          style={{ ...typography.bodyStrong, color: colors.ink, flex: 1, minHeight: 54 }}
        />
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{suffix}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing.x6, gap: spacing.x5 }}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Тарифы и комиссия</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Новые значения применяются только к новым расчётам. Каждое изменение записывается в журнал аудита.
        </Text>
      </View>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Комиссия сервиса</Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'Комиссия по умолчанию',
            String(rules.serviceCommissionBps / 100),
            (value) => changeInteger('serviceCommissionBps', value, 100),
            '%',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Для конкретного водителя можно установить персональную комиссию в его карточке.
        </Text>
      </SurfaceCard>
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Стоимость поездки
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'С 07:00 до 22:00',
            String(rules.fare07To22Minor / 100),
            (value) => changeRubles('fare07To22Minor', value),
            '₽',
          )}
          {field(
            'С 22:00 до 02:00',
            String(rules.fare22To02Minor / 100),
            (value) => changeRubles('fare22To02Minor', value),
            '₽',
          )}
          {field(
            'С 02:00 до 07:00',
            String(rules.fare02To07Minor / 100),
            (value) => changeRubles('fare02To07Minor', value),
            '₽',
          )}
          {field(
            'Надбавка за детский тариф',
            String(rules.childSurchargeMinor / 100),
            (value) => changeRubles('childSurchargeMinor', value),
            '₽',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Для всех поездок действует фиксированная цена по времени оформления заказа.
          Интервалы рассчитываются по самарскому времени.
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Детский тариф назначает любую машину с подтверждённым креслом — пассажир
          не выбирает тип кресла.
        </Text>
      </SurfaceCard>
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Ожидание по просьбе пассажира
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'Бесплатное ожидание',
            String(rules.waitingFreeMinutes),
            (value) => changeInteger('waitingFreeMinutes', value),
            'мин',
          )}
          {field(
            'После бесплатного времени',
            String(rules.waitingPerMinuteMinor / 100),
            (value) => changeRubles('waitingPerMinuteMinor', value),
            '₽/мин',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Водитель включает ожидание только во время поездки. После бесплатного
          лимита каждая начатая минута добавляется к итоговой стоимости.
        </Text>
      </SurfaceCard>
      {saved && <StatusChip label="Настройки сохранены" tone="success" />}
      <AppButton fullWidth={false} loading={busy} style={{ minWidth: 220 }} onPress={() => void save()}>
        Сохранить изменения
      </AppButton>
      <AppButton
        fullWidth={false}
        variant="danger"
        style={{ minWidth: 220, alignSelf: 'flex-start' }}
        onPress={() => void signOut()}
      >
        Выйти из аккаунта
      </AppButton>
    </ScrollView>
  );
}
