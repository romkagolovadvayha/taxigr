import { Host, TextInput } from '@expo/ui';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  defaultFirstOrderPromotionSettings, discountPercentTag, promotionMessageMaxLength,
  renderPromotionMessage, type FirstOrderPromotionSettings,
} from '@/domain/first-order-discount';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

const endpoint = '/v1/admin/promotion-settings';

export function PromotionSettingsCard({ token, demo }: { token: string | null; demo: boolean }) {
  const colors = useThemeColors();
  const [formVersion, setFormVersion] = useState(0);
  const [settings, setSettings] = useState(defaultFirstOrderPromotionSettings);
  const [baseline, setBaseline] = useState(defaultFirstOrderPromotionSettings);
  const [percentText, setPercentText] = useState(String(defaultFirstOrderPromotionSettings.discountPercent));
  const [loaded, setLoaded] = useState(demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const apply = useCallback((next: FirstOrderPromotionSettings) => {
    const normalized = { ...defaultFirstOrderPromotionSettings, ...next };
    setPercentText(String(normalized.discountPercent));
    setSettings(normalized);
    setBaseline(normalized);
    setFormVersion(current => current + 1);
  }, []);
  const load = useCallback((signal?: AbortSignal) => {
    if (demo || !token) return;
    return apiRequest<FirstOrderPromotionSettings>(endpoint, { token, signal }).then(next => {
      if (signal?.aborted) return;
      setError(null);
      apply(next);
      setLoaded(true);
    }).catch((reason: unknown) => {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки скидки');
    });
  }, [apply, demo, token]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const validPercent = /^\d{1,3}$/u.test(percentText) && Number(percentText) <= 100;
  const dirty = percentText !== String(baseline.discountPercent) || settings.messageTemplate !== baseline.messageTemplate;
  const changed = () => setSaved(false);
  const save = async () => {
    if (!validPercent || busy || !loaded) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      if (!demo) {
        const next = await apiRequest<FirstOrderPromotionSettings>(endpoint, {
          token: token ?? undefined, method: 'PUT', body: JSON.stringify(settings),
        });
        apply(next);
      }
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки скидки');
    } finally { setBusy(false); }
  };
  const inputStyle = {
    minHeight: 56, padding: spacing.x4, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface,
  };
  return <SurfaceCard>
    <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>Скидка на первый заказ</Text>
    <Text style={{ ...typography.body, color: colors.inkSecondary }}>
      Настройка супер администратора. Скидка применяется к первому заказу по Грахово и району. На межгород не действует.
    </Text>
    {!loaded && !error && <Text style={{ ...typography.body, color: colors.inkSecondary }}>Загружаем настройки скидки…</Text>}
    <View style={{ gap: spacing.x2 }}>
      <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Процент скидки</Text>
      <Host matchContents accessibilityLabel="Процент скидки на первый заказ">
        <TextInput key={`percent:${formVersion}`} defaultValue={percentText} testID="promotion-discount-percent" keyboardType="number-pad" maxLength={3}
          editable={loaded && !busy} style={inputStyle} textStyle={{ fontSize: 16, fontFamily: 'Arial', color: colors.ink }}
          onChangeText={value => {
            setPercentText(value);
            setSettings(current => ({ ...current, discountPercent: Number(value) }));
            changed();
          }} />
      </Host>
      <Text style={{ ...typography.caption, color: colors.inkMuted }}>От 0 до 100. Значение 0 отключает скидку для новых расчётов.</Text>
      {!validPercent && <Text accessibilityRole="alert" style={{ color: colors.danger }}>Введите целый процент от 0 до 100.</Text>}
    </View>
    <View style={{ gap: spacing.x2 }}>
      <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Сообщение при подтверждении заказа</Text>
      <Host matchContents={{ vertical: true }} style={{ width: '100%' }} accessibilityLabel="Сообщение при подтверждении заказа">
        <TextInput key={`template:${formVersion}`} defaultValue={settings.messageTemplate} testID="promotion-message-template" multiline numberOfLines={4}
          maxLength={promotionMessageMaxLength} editable={loaded && !busy} style={{ ...inputStyle, width: '100%' }}
          textStyle={{ fontSize: 16, fontFamily: 'Arial', color: colors.ink }} onChangeText={value => {
            setSettings(current => ({ ...current, messageTemplate: value }));
            changed();
          }} />
      </Host>
      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
        Тег {discountPercentTag} подставляет фактический процент без знака %. Пример: «Ваша скидка {discountPercentTag}%».
        {' '}Тег можно перемещать, повторять или удалять. Пустой текст скрывает сообщение, сама скидка сохраняется.
      </Text>
    </View>
    {loaded && validPercent && <View style={{ gap: spacing.x2 }}>
      <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Предпросмотр сообщения</Text>
      <Text selectable testID="promotion-message-preview" style={{ ...typography.body, color: colors.inkSecondary }}>
        {settings.discountPercent === 0 ? 'Скидка отключена, сообщение не показывается.' : renderPromotionMessage(settings) || 'Сообщение скрыто.'}
      </Text>
    </View>}
    {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
    {!!error && !loaded && <AppButton variant="secondary" onPress={() => void load()}>Повторить загрузку</AppButton>}
    {saved && <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: colors.ink }}>
      {demo ? 'Демо: настройки не отправлены на сервер.' : 'Настройки скидки сохранены.'}
    </Text>}
    <AppButton fullWidth={false} disabled={!loaded || !dirty || !validPercent || busy} loading={busy} onPress={() => void save()}>
      Сохранить скидку и текст
    </AppButton>
  </SurfaceCard>;
}
