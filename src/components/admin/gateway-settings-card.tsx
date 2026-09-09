import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  defaultGatewaySettings, type GatewaySettingsView, type TelegramWebhookStatus,
} from '@/domain/gateway';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

const endpoint = '/v1/admin/gateway-settings';

export function GatewaySettingsCard({ token, demo }: { token: string | null; demo: boolean }) {
  const colors = useThemeColors();
  const [settings, setSettings] = useState<GatewaySettingsView>(defaultGatewaySettings);
  const [proxyPassword, setProxyPassword] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loaded, setLoaded] = useState(demo);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TelegramWebhookStatus | null>(null);

  useEffect(() => {
    if (demo || !token) return;
    const controller = new AbortController();
    void apiRequest<GatewaySettingsView>(endpoint, { token, signal: controller.signal })
      .then((value) => { setSettings(value); setLoaded(true); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки прокси');
      });
    return () => controller.abort();
  }, [demo, token]);

  const changed = () => { setDirty(true); setMessage(null); setStatus(null); };
  const change = <K extends keyof GatewaySettingsView>(key: K, value: GatewaySettingsView[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    changed();
  };
  const run = async (action: string, work: () => Promise<void>) => {
    setBusy(action); setError(null); setMessage(null);
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить действие'); }
    finally { setBusy(null); }
  };
  const save = () => run('save', async () => {
    if (demo) { setMessage('Демо: настройки не отправляются на сервер'); return; }
    const { hasProxyPassword: _password, hasWebhookSecret: _secret, ...values } = settings;
    const next = await apiRequest<GatewaySettingsView>(endpoint, {
      token: token ?? undefined, method: 'PUT', body: JSON.stringify({ ...values, proxyPassword, webhookSecret }),
    });
    setSettings(next); setProxyPassword(''); setWebhookSecret(''); setDirty(false); setStatus(null);
    setMessage('Настройки сохранены. Для изменения входящих вебхуков нажмите «Зарегистрировать вебхук».');
  });
  const telegram = (register: boolean) => run(register ? 'register' : 'status', async () => {
    const next = await apiRequest<TelegramWebhookStatus>(`${endpoint}/telegram`, {
      token: token ?? undefined, method: register ? 'POST' : 'GET',
    });
    setStatus(next);
    if (register) setMessage('Telegram подтвердил регистрацию вебхука. Ожидающие события сохранены.');
  });
  const field = (label: string, value: string, onChangeText: (value: string) => void, secret = false, placeholder = '') => (
    <View style={{ gap: spacing.x2, flex: 1, minWidth: 220 }}>
      <Text style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} accessibilityLabel={label}
        secureTextEntry={secret} autoCapitalize="none" autoCorrect={false}
        autoComplete="off" editable={loaded && !busy} placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        style={{ ...typography.body, color: colors.ink, backgroundColor: colors.surface,
          borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
          paddingHorizontal: spacing.x4, minHeight: 56 }}
      />
    </View>
  );
  const toggle = (label: string, key: 'proxyEnabled' | 'webhooksEnabled') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x4 }}>
      <Text style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>{label}</Text>
      <Switch value={settings[key]} onValueChange={(value) => change(key, value)}
        disabled={!loaded || !!busy} accessibilityLabel={label} />
    </View>
  );
  const networkDisabled = !loaded || dirty || !!busy || demo;
  return (
    <SurfaceCard>
      <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>Прокси и вебхуки Telegram</Text>
      <Text style={{ ...typography.body, color: colors.inkSecondary }}>
        Настройки доступны супер администратору и хранятся в базе данных. Прокси применяется к запросам бота и загрузке аватаров Telegram сразу после сохранения.
      </Text>
      {toggle('Отправлять запросы Telegram через прокси', 'proxyEnabled')}
      {field('HTTPS-адрес прокси', settings.proxyUrl, (value) => change('proxyUrl', value))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x4 }}>
        {field('Логин прокси', settings.proxyUsername, (value) => change('proxyUsername', value))}
        {field('Пароль прокси', proxyPassword, (value) => { setProxyPassword(value); changed(); }, true,
          settings.hasProxyPassword ? 'Сохранён — оставьте пустым, чтобы сохранить' : 'Пароль проекта Prostoj')}
      </View>
      {toggle('Принимать вебхуки через шлюз Prostoj', 'webhooksEnabled')}
      {field('Адрес шлюза вебхуков', settings.webhookUrl, (value) => change('webhookUrl', value))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x4 }}>
        {field('Проект Prostoj', settings.project, (value) => change('project', value))}
        {field('Ключ вебхуков проекта', webhookSecret, (value) => { setWebhookSecret(value); changed(); }, true,
          settings.hasWebhookSecret ? 'Сохранён — оставьте пустым, чтобы сохранить' : 'webhook_secret проекта')}
      </View>
      {field('Публичный адрес API приложения', settings.apiPublicUrl, (value) => change('apiPublicUrl', value), false, 'https://api.taxigr.ru')}
      <Text style={{ ...typography.caption, color: colors.inkMuted }}>
        Пароль прокси и ключ вебхуков — разные секреты проекта Prostoj. Сохранённые значения скрыты.
        После смены проекта, ключа или адреса API зарегистрируйте вебхук заново.
      </Text>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" selectable style={{ ...typography.body, color: colors.ink }}>{message}</Text>}
      {!!status && <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
        {status.matchesSettings ? 'Адрес вебхука совпадает с настройками.' : status.configured ? 'Адрес в Telegram отличается. Зарегистрируйте вебхук заново.' : 'Вебхук не зарегистрирован.'}
        {'\n'}Доставка: {status.gateway ? 'через шлюз' : 'напрямую'}. В очереди: {status.pendingUpdates}.
        {status.hasDeliveryError && status.lastErrorAt ? `\nПоследняя ошибка доставки: ${new Date(status.lastErrorAt).toLocaleString('ru-RU')}.` : ''}
      </Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
        <AppButton fullWidth={false} disabled={!loaded || !!busy || !dirty} loading={busy === 'save'} onPress={() => void save()}>Сохранить прокси</AppButton>
        <AppButton fullWidth={false} variant="secondary" disabled={networkDisabled} loading={busy === 'test'} onPress={() => void run('test', async () => {
          const result = await apiRequest<{ botUsername: string }>(`${endpoint}/test`, { token: token ?? undefined, method: 'POST' });
          setMessage(`Соединение работает. Бот: @${result.botUsername}`);
        })}>Проверить соединение</AppButton>
        <AppButton fullWidth={false} variant="secondary" disabled={networkDisabled || !settings.apiPublicUrl} loading={busy === 'register'} onPress={() => void telegram(true)}>Зарегистрировать вебхук</AppButton>
        <AppButton fullWidth={false} variant="quiet" disabled={networkDisabled} loading={busy === 'status'} onPress={() => void telegram(false)}>Проверить вебхук</AppButton>
      </View>
      {dirty && <Text style={{ ...typography.caption, color: colors.inkMuted }}>Сохраните изменения перед проверкой соединения и регистрацией вебхука.</Text>}
    </SurfaceCard>
  );
}
