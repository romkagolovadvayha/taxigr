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
  | 'grahovoFare07To22Minor'
  | 'grahovoFare22To02Minor'
  | 'grahovoFare02To07Minor'
  | 'districtPerKilometer07To22Minor'
  | 'districtPerKilometer22To02Minor'
  | 'districtPerKilometer02To07Minor'
  | 'intercityPerKilometerMinor'
  | 'childSurchargeMinor'
  | 'waitingFreeMinutes'
  | 'waitingPerMinuteMinor'
  | 'searchPriceIncreaseIntervalMinutes'
  | 'searchPriceIncreaseStepMinor'
  | 'passengerCancellationLimit'
  | 'passengerCancellationWindowHours'
  | 'passengerCancellationBlockHours';

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
    accessibilityLabel = label,
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
          accessibilityLabel={accessibilityLabel}
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
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Настройки сервиса</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Изменения тарифов и правил применяются к новым заказам. Каждое изменение записывается в журнал аудита.
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
          Защита от частых отмен
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'Блокировать после',
            String(rules.passengerCancellationLimit),
            (value) => changeInteger('passengerCancellationLimit', value),
            'отмен',
            'Число отмен для блокировки',
          )}
          {field(
            'Считать отмены за',
            String(rules.passengerCancellationWindowHours),
            (value) => changeInteger('passengerCancellationWindowHours', value),
            'ч',
            'Окно подсчёта отмен в часах',
          )}
          {field(
            'Блокировать на',
            String(rules.passengerCancellationBlockHours),
            (value) => changeInteger('passengerCancellationBlockHours', value),
            'ч',
            'Срок блокировки заказов в часах',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Сейчас: после {rules.passengerCancellationLimit} отмен за{' '}
          {rules.passengerCancellationWindowHours} часов заказы блокируются на{' '}
          {rules.passengerCancellationBlockHours} часов. Администратор может снять ограничение в
          карточке пассажира.
        </Text>
      </SurfaceCard>
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Стоимость поездки
        </Text>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          По Грахово · фиксированная стоимость
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'С 07:00 до 22:00',
            String(rules.grahovoFare07To22Minor / 100),
            (value) => changeRubles('grahovoFare07To22Minor', value),
            '₽',
            'Грахово, с 07:00 до 22:00',
          )}
          {field(
            'С 22:00 до 02:00',
            String(rules.grahovoFare22To02Minor / 100),
            (value) => changeRubles('grahovoFare22To02Minor', value),
            '₽',
            'Грахово, с 22:00 до 02:00',
          )}
          {field(
            'С 02:00 до 07:00',
            String(rules.grahovoFare02To07Minor / 100),
            (value) => changeRubles('grahovoFare02To07Minor', value),
            '₽',
            'Грахово, с 02:00 до 07:00',
          )}
        </View>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          По Граховскому району · стоимость за километр
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'С 07:00 до 22:00',
            String(rules.districtPerKilometer07To22Minor / 100),
            (value) => changeRubles('districtPerKilometer07To22Minor', value),
            '₽/км',
            'Граховский район, с 07:00 до 22:00',
          )}
          {field(
            'С 22:00 до 02:00',
            String(rules.districtPerKilometer22To02Minor / 100),
            (value) => changeRubles('districtPerKilometer22To02Minor', value),
            '₽/км',
            'Граховский район, с 22:00 до 02:00',
          )}
          {field(
            'С 02:00 до 07:00',
            String(rules.districtPerKilometer02To07Minor / 100),
            (value) => changeRubles('districtPerKilometer02To07Minor', value),
            '₽/км',
            'Граховский район, с 02:00 до 07:00',
          )}
        </View>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          Межгород
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'Стоимость за километр',
            String(rules.intercityPerKilometerMinor / 100),
            (value) => changeRubles('intercityPerKilometerMinor', value),
            '₽/км',
          )}
        </View>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          Доплата
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'Надбавка за детский тариф',
            String(rules.childSurchargeMinor / 100),
            (value) => changeRubles('childSurchargeMinor', value),
            '₽',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          В Грахово действует фиксированная сумма, в Граховском районе — ставка за
          километр по времени оформления заказа. Межгород рассчитывается по отдельной
          ставке за километр. Временные интервалы считаются по самарскому времени.
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Детский тариф назначает любую машину с подтверждённым креслом — пассажир
          не выбирает тип кресла.
        </Text>
      </SurfaceCard>
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Повышение цены при поиске
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'Предлагать каждые',
            String(rules.searchPriceIncreaseIntervalMinutes),
            (value) => changeInteger('searchPriceIncreaseIntervalMinutes', value),
            'мин',
            'Интервал предложения повысить стоимость',
          )}
          {field(
            'Повышать на',
            String(rules.searchPriceIncreaseStepMinor / 100),
            (value) => changeRubles('searchPriceIncreaseStepMinor', value),
            '₽',
            'Шаг повышения стоимости',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Пока водитель не найден, пассажир увидит попап через заданный интервал.
          После подтверждения новая цена сразу отправится свободным водителям, а
          следующий интервал продолжит считаться от момента создания заказа.
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
