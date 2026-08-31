import { router, type Href } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { AccessibleSwitch } from '@/components/ui/accessible-switch';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { AppButton } from '@/components/ui/app-button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { useRideFeedback } from '@/feedback/ride-feedback-provider';
import {
  hasNotificationPermission,
  requestNotificationPermission,
} from '@/notifications/permissions';
import { syncPushRegistration } from '@/notifications/push-registration';
import { goBackOrReplace } from '@/navigation/back';
import { useFeedbackPreferences } from '@/preferences/feedback-preferences-provider';
import { usePassengerPreferences } from '@/preferences/passenger-preferences-provider';
import { useAppTheme } from '@/theme/theme-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type MessengerProvider = 'vk' | 'max' | 'telegram';

type NotificationChannel = {
  provider: MessengerProvider;
  connected: boolean;
  available: boolean;
  enabled: boolean;
};

const notificationChannelDetails: Record<MessengerProvider, {
  title: string;
  subtitle: string;
}> = {
  vk: { title: 'ВКонтакте', subtitle: 'Сообщения от сообщества «Такси Грахово»' },
  max: { title: 'MAX', subtitle: 'Сообщения от бота «Такси Грахово»' },
  telegram: { title: 'Telegram', subtitle: 'Сообщения от бота «Такси Грахово»' },
};

const emptyNotificationChannels: NotificationChannel[] = (
  Object.keys(notificationChannelDetails) as MessengerProvider[]
).map((provider) => ({
  provider,
  connected: false,
  available: false,
  enabled: false,
}));

function SettingToggle({
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.x4 }}>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{title}</Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{subtitle}</Text>
      </View>
      <AccessibleSwitch
        value={value}
        disabled={disabled}
        accessibilityLabel={title}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function SettingsScreen() {
  const [push, setPush] = useState(false);
  const [pushChanging, setPushChanging] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushInfo, setPushInfo] = useState<string | null>(null);
  const [pushSettingsRequired, setPushSettingsRequired] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [notificationChannels, setNotificationChannels] = useState(emptyNotificationChannels);
  const [notificationChannelsLoading, setNotificationChannelsLoading] = useState(true);
  const [notificationChannelChanging, setNotificationChannelChanging] = useState<MessengerProvider | null>(null);
  const [notificationChannelsError, setNotificationChannelsError] = useState<string | null>(null);
  const [locationSharingChanging, setLocationSharingChanging] = useState(false);
  const { token } = useSession();
  const { dark, setDark } = useAppTheme();
  const { previewFeedback } = useRideFeedback();
  const {
    soundEnabled,
    vibrationEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  } = useFeedbackPreferences();
  const { shareLocationWithDriver, setShareLocationWithDriver } = usePassengerPreferences();

  const changeLocationSharing = async (enabled: boolean) => {
    if (!enabled) {
      setShareLocationWithDriver(false);
      return;
    }
    setLocationSharingChanging(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setShareLocationWithDriver(permission.granted);
    } finally {
      setLocationSharingChanging(false);
    }
  };

  useEffect(() => {
    let active = true;
    const refreshPermission = async () => {
      const granted = await hasNotificationPermission();
      if (!active) return;
      setPush(granted);
      if (granted) {
        setPushError(null);
        setPushSettingsRequired(false);
      }
    };
    void refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!token) {
      return () => {
        active = false;
      };
    }
    void apiRequest<{ channels: NotificationChannel[] }>('/v1/me/notification-channels', { token })
      .then((result) => {
        if (!active) return;
        setNotificationChannels(result.channels);
        setNotificationChannelsError(null);
      })
      .catch((error) => {
        if (!active) return;
        setNotificationChannelsError(
          error instanceof Error ? error.message : 'Не удалось загрузить источники уведомлений.',
        );
      })
      .finally(() => {
        if (active) setNotificationChannelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const changeNotificationChannel = async (provider: MessengerProvider, enabled: boolean) => {
    if (!token || notificationChannelChanging) return;
    setNotificationChannelChanging(provider);
    setNotificationChannelsError(null);
    try {
      const result = await apiRequest<{ channels: NotificationChannel[] }>(
        '/v1/me/notification-channels',
        {
          method: 'PUT',
          token,
          body: JSON.stringify({ provider, enabled }),
        },
      );
      setNotificationChannels(result.channels);
    } catch (error) {
      setNotificationChannelsError(
        error instanceof Error ? error.message : 'Не удалось сохранить источник уведомлений.',
      );
    } finally {
      setNotificationChannelChanging(null);
    }
  };

  const changePush = async (enabled: boolean) => {
    if (pushChanging) return;
    setPushChanging(true);
    setPushError(null);
    setPushInfo(null);
    setPushSettingsRequired(false);
    try {
      if (enabled) {
        try {
          const granted = await requestNotificationPermission();
          if (!granted) {
            setPush(false);
            setPushSettingsRequired(Platform.OS !== 'web');
            setPushError(
              Platform.OS === 'web'
                ? 'Разрешите уведомления в настройках сайта браузера.'
                : 'Android не разрешил уведомления. Откройте настройки приложения и включите их вручную.',
            );
            return;
          }
          if (!token) {
            setPush(false);
            setPushError('Не удалось определить активную сессию. Войдите в приложение ещё раз.');
            return;
          }
          const registered = await syncPushRegistration(token);
          setPush(registered);
          if (!registered) setPushError('Не удалось зарегистрировать устройство для push.');
        } catch (error) {
          setPush(false);
          setPushError(error instanceof Error ? error.message : 'Не удалось подключить push.');
        }
      } else {
        if (Platform.OS === 'web') {
          setPushError('Отключите уведомления в настройках сайта браузера.');
        } else {
          await Linking.openSettings();
        }
      }
    } finally {
      setPushChanging(false);
    }
  };

  const openNotificationSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Не удалось открыть настройки приложения.');
    }
  };

  const testPush = async () => {
    if (!token) return;
    setPushTesting(true);
    setPushError(null);
    setPushInfo(null);
    try {
      await apiRequest('/v1/push/test', { method: 'POST', token });
      setPushInfo('Тестовое уведомление отправлено.');
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Не удалось отправить тестовый push.');
    } finally {
      setPushTesting(false);
    }
  };

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/profile')} />
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Настройки</Text>
      </View>
      <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Оформление</Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          paddingHorizontal: spacing.x4,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <SettingToggle
          title="Тёмная тема"
          subtitle={dark ? 'Тёмный интерфейс и карта' : 'Светлый интерфейс'}
          value={dark}
          onValueChange={setDark}
        />
      </View>
      <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Уведомления и поездка</Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          paddingHorizontal: spacing.x4,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <SettingToggle
          title="Показывать водителю, где я"
          subtitle="Только во время активного заказа"
          value={shareLocationWithDriver}
          disabled={locationSharingChanging}
          onValueChange={(enabled) => void changeLocationSharing(enabled)}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <View style={{ paddingVertical: spacing.x3, gap: spacing.x1 }}>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            Куда уведомлять
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Можно включить один или несколько подключённых источников
          </Text>
        </View>
        {notificationChannels.map((channel, index) => {
          const details = notificationChannelDetails[channel.provider];
          const disabled = notificationChannelsLoading
            || Boolean(notificationChannelChanging)
            || !channel.connected
            || !channel.available;
          const subtitle = notificationChannelsLoading
            ? 'Проверяем подключение…'
            : !channel.connected
              ? 'Не подключён к вашему аккаунту'
              : !channel.available
                ? 'Разрешите сообщения этому боту или сообществу'
                : details.subtitle;
          return (
            <View key={channel.provider}>
              {index > 0 && <View style={{ height: 1, backgroundColor: colors.border }} />}
              <SettingToggle
                title={details.title}
                subtitle={subtitle}
                value={channel.enabled}
                disabled={disabled}
                onValueChange={(value) => void changeNotificationChannel(channel.provider, value)}
              />
            </View>
          );
        })}
        {!!notificationChannelsError && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
            {notificationChannelsError}
          </Text>
        )}
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <SettingToggle
          title="Push-уведомления"
          subtitle="Новые заказы, назначение и прибытие водителя"
          value={push}
          disabled={pushChanging}
          onValueChange={(value) => void changePush(value)}
        />
        {!!pushError && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
            {pushError}
          </Text>
        )}
        {pushSettingsRequired && (
          <AppButton variant="secondary" onPress={() => void openNotificationSettings()}>
            Открыть настройки приложения
          </AppButton>
        )}
        {!!pushInfo && (
          <Text accessibilityLiveRegion="polite" selectable style={{ ...typography.caption, color: colors.success }}>
            {pushInfo}
          </Text>
        )}
        <AppButton
          variant="secondary"
          disabled={!push}
          loading={pushTesting}
          onPress={() => void testPush()}
        >
          Отправить тестовое уведомление
        </AppButton>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <SettingToggle
          title="Звуки событий"
          subtitle="Машина найдена, водитель приехал, новый заказ"
          value={soundEnabled}
          onValueChange={setSoundEnabled}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <SettingToggle
          title="Вибрация"
          subtitle="Короткий сигнал при важных изменениях"
          value={vibrationEnabled}
          onValueChange={setVibrationEnabled}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <AnimatedPressable feedback="subtle"
          accessibilityRole="button"
          accessibilityLabel="Проверить звук и вибрацию"
          aria-disabled={!soundEnabled && !vibrationEnabled}
          disabled={!soundEnabled && !vibrationEnabled}
          onPress={() => void previewFeedback()}
          style={({ pressed }) => ({
            minHeight: 64,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            opacity: !soundEnabled && !vibrationEnabled ? 0.42 : pressed ? 0.62 : 1,
          })}
        >
          <AppIcon name="volume" size={22} />
          <Text selectable style={{ ...typography.body, color: colors.ink, flex: 1 }}>
            Проверить оповещение
          </Text>
          <AppIcon name="chevron" size={20} color={colors.inkMuted} />
        </AnimatedPressable>
      </View>
      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
        Местоположение передаётся водителю только при активном заказе и включённой
        настройке. Управлять системным разрешением геолокации можно в настройках
        устройства.
      </Text>
      <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Аккаунт и данные</Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          paddingHorizontal: spacing.x4,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <AnimatedPressable feedback="subtle"
          accessibilityRole="button"
          accessibilityLabel="Запросить удаление аккаунта и данных"
          onPress={() => router.push('/account-deletion' as Href)}
          style={({ pressed }) => ({
            minHeight: 72,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            opacity: pressed ? 0.62 : 1,
          })}
        >
          <AppIcon name="document" size={22} color={colors.dangerText} />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.dangerText }}>
              Удалить аккаунт
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Инструкция, сроки и запрос в поддержку
            </Text>
          </View>
          <AppIcon name="chevron" size={20} color={colors.inkMuted} />
        </AnimatedPressable>
      </View>
    </Screen>
  );
}
