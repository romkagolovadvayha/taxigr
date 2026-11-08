import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { GatewaySettingsCard } from '@/components/admin/gateway-settings-card';
import { OperatorSettingsCard } from '@/components/admin/operator-settings-card';
import { BookingSettingsCard } from '@/components/admin/booking-settings-card';
import { PromotionSettingsCard } from '@/components/admin/promotion-settings-card';
import { GroupAlertsCard } from '@/components/admin/group-alerts-card';
import { AppButton } from '@/components/ui/app-button';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  defaultDriverDispatchSettings,
  type DriverDispatchSettings,
} from '@/domain/driver-priority';
import { defaultPricingRules, farePeriodLabel, intercityTimeRates, type PricingRules } from '@/domain/pricing';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type EditableKey =
  | 'serviceCommissionBps'
  | 'grahovoFare07To22Minor'
  | 'grahovoFare22To02Minor'
  | 'grahovoFare02To07Minor'
  | 'districtPerKilometer07To22Minor'
  | 'districtPerKilometer22To02Minor'
  | 'districtPerKilometer02To07Minor'
  | 'intercityPerKilometer07To22Minor'
  | 'intercityPerKilometer22To02Minor'
  | 'intercityPerKilometer02To07Minor'
  | 'childSurchargeMinor'
  | 'additionalStopGrahovoSurchargeBps'
  | 'waitingFreeMinutes'
  | 'waitingPerMinuteMinor'
  | 'searchPriceIncreaseIntervalMinutes'
  | 'searchPriceIncreaseStepMinor'
  | 'passengerCancellationLimit'
  | 'passengerCancellationWindowHours'
  | 'passengerCancellationBlockHours';

export function AdminSettingsScreen() {
  const colors = useThemeColors();
  const { user, token, signOut } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [rules, setRules] = useState<PricingRules>(defaultPricingRules);
  const [dispatchSettings, setDispatchSettings] = useState<DriverDispatchSettings>(
    defaultDriverDispatchSettings,
  );
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const loaded = demo || (!!token && loadedToken === token);

  const loadSettings = useCallback((signal?: AbortSignal) => {
    if (demo || !token) return;
    return Promise.all([
        apiRequest<PricingRules>('/v1/admin/tariffs', { token, signal }),
        apiRequest<DriverDispatchSettings>('/v1/admin/driver-dispatch-settings', { token, signal }),
      ]).then(([nextRules, nextDispatchSettings]) => {
      if (!signal?.aborted) {
        setRules({ ...nextRules, ...intercityTimeRates(nextRules) });
        setDispatchSettings(nextDispatchSettings);
        setLoadedToken(token);
        setError(null);
      }
    }).catch((reason: unknown) => {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки');
    });
  }, [demo, token]);
  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings]);

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
    if (busy || !loaded) return;
    if (demo) {
      setSaved(true);
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      const [updatedRules, updatedDispatchSettings] = await Promise.all([
        apiRequest<PricingRules>('/v1/admin/tariffs', {
          method: 'PUT',
          token,
          body: JSON.stringify(rules),
        }),
        apiRequest<DriverDispatchSettings>('/v1/admin/driver-dispatch-settings', {
          method: 'PUT',
          token,
          body: JSON.stringify(dispatchSettings),
        }),
      ]);
      setRules({ ...updatedRules, ...intercityTimeRates(updatedRules) });
      setDispatchSettings(updatedDispatchSettings);
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
          editable={loaded && !busy}
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
      {!loaded && !error && <Text style={{ ...typography.body, color: colors.inkSecondary }}>Загружаем тарифы и правила…</Text>}
      {!loaded && !!error && <AppButton variant="secondary" fullWidth={false} onPress={() => void loadSettings()}>Повторить загрузку тарифов</AppButton>}
      <BookingSettingsCard key={`booking:${token}`} token={token} demo={demo} />
      {user?.roles.includes('admin') && <PromotionSettingsCard key={`promotion:${token}`} token={token} demo={demo} />}
      <GroupAlertsCard key={`group-alerts:${token}`} token={token} demo={demo} />
      <OperatorSettingsCard key={token} token={token} demo={demo} />
      <GatewaySettingsCard token={token} demo={demo} />
      <SurfaceCard>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Приоритетная раздача заказов
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Приоритетные водители получают заказ сразу. Остальным он станет доступен через
          указанное время, если его никто не принял.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            'По Грахово',
            String(dispatchSettings.grahovo),
            (value) => {
              setDispatchSettings((current) => ({
                ...current,
                grahovo: Math.min(120, Number(value.replace(/[^\d]/g, '')) || 0),
              }));
              setSaved(false);
            },
            'мин',
            'Задержка для обычных водителей по Грахово',
          )}
          {field(
            'По Граховскому району',
            String(dispatchSettings.district),
            (value) => {
              setDispatchSettings((current) => ({
                ...current,
                district: Math.min(120, Number(value.replace(/[^\d]/g, '')) || 0),
              }));
              setSaved(false);
            },
            'мин',
            'Задержка для обычных водителей по району',
          )}
          {field(
            'Межгород',
            String(dispatchSettings.intercity),
            (value) => {
              setDispatchSettings((current) => ({
                ...current,
                intercity: Math.min(120, Number(value.replace(/[^\d]/g, '')) || 0),
              }));
              setSaved(false);
            },
            'мин',
            'Задержка для обычных водителей по межгороду',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Значение 0 отключает задержку для выбранной зоны. Если среди свободных водителей
          нет приоритетных, заказ сразу увидят все подходящие водители.
        </Text>
      </SurfaceCard>
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
            farePeriodLabel['07-22'],
            String(rules.grahovoFare07To22Minor / 100),
            (value) => changeRubles('grahovoFare07To22Minor', value),
            '₽',
            `Грахово, ${farePeriodLabel['07-22'].toLowerCase()}`,
          )}
          {field(
            farePeriodLabel['22-01'],
            String(rules.grahovoFare22To02Minor / 100),
            (value) => changeRubles('grahovoFare22To02Minor', value),
            '₽',
            `Грахово, ${farePeriodLabel['22-01'].toLowerCase()}`,
          )}
          {field(
            farePeriodLabel['01-07'],
            String(rules.grahovoFare02To07Minor / 100),
            (value) => changeRubles('grahovoFare02To07Minor', value),
            '₽',
            `Грахово, ${farePeriodLabel['01-07'].toLowerCase()}`,
          )}
        </View>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          По Граховскому району · стоимость за километр
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            farePeriodLabel['07-22'],
            String(rules.districtPerKilometer07To22Minor / 100),
            (value) => changeRubles('districtPerKilometer07To22Minor', value),
            '₽/км',
            `Граховский район, ${farePeriodLabel['07-22'].toLowerCase()}`,
          )}
          {field(
            farePeriodLabel['22-01'],
            String(rules.districtPerKilometer22To02Minor / 100),
            (value) => changeRubles('districtPerKilometer22To02Minor', value),
            '₽/км',
            `Граховский район, ${farePeriodLabel['22-01'].toLowerCase()}`,
          )}
          {field(
            farePeriodLabel['01-07'],
            String(rules.districtPerKilometer02To07Minor / 100),
            (value) => changeRubles('districtPerKilometer02To07Minor', value),
            '₽/км',
            `Граховский район, ${farePeriodLabel['01-07'].toLowerCase()}`,
          )}
        </View>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          Межгород · стоимость за километр
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {field(
            farePeriodLabel['07-22'],
            String(rules.intercityPerKilometer07To22Minor / 100),
            (value) => changeRubles('intercityPerKilometer07To22Minor', value),
            '₽/км',
            `Межгород, ${farePeriodLabel['07-22'].toLowerCase()}`,
          )}
          {field(
            farePeriodLabel['22-01'],
            String(rules.intercityPerKilometer22To02Minor / 100),
            (value) => changeRubles('intercityPerKilometer22To02Minor', value),
            '₽/км',
            `Межгород, ${farePeriodLabel['22-01'].toLowerCase()}`,
          )}
          {field(
            farePeriodLabel['01-07'],
            String(rules.intercityPerKilometer02To07Minor / 100),
            (value) => changeRubles('intercityPerKilometer02To07Minor', value),
            '₽/км',
            `Межгород, ${farePeriodLabel['01-07'].toLowerCase()}`,
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
          {field(
            'Каждая дополнительная точка по Грахово',
            String(rules.additionalStopGrahovoSurchargeBps / 100),
            (value) => changeInteger('additionalStopGrahovoSurchargeBps', value, 100),
            '%',
            'Надбавка за дополнительную точку по Грахово в процентах',
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          В Грахово действует фиксированная сумма, в Граховском районе — ставка за
          километр по времени оформления заказа. В межгороде действует отдельная
          ставка за километр для каждого периода. Временные интервалы считаются по самарскому времени.
          Если весь маршрут проходит по Грахово, каждая дополнительная точка добавляет{' '}
          {rules.additionalStopGrahovoSurchargeBps / 100}% текущей фиксированной стоимости.
          Для точек в районе и межгороде каждый следующий участок считается по действующему тарифу.
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Тариф «Детский» отмечает поездку с ребёнком и просьбу вести аккуратно.
          Получать и принимать такие заказы могут все водители на линии.
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
      {saved && <StatusChip label={demo ? 'Демо: настройки не отправлены на сервер' : 'Настройки сохранены'} tone="success" />}
      <AppButton fullWidth={false} disabled={!loaded || busy} loading={busy} style={{ minWidth: 220 }} onPress={() => void save()}>
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
