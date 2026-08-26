import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';

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
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushInfo, setPushInfo] = useState<string | null>(null);
  const [pushTesting, setPushTesting] = useState(false);
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

  useEffect(() => {
    void hasNotificationPermission().then(setPush);
  }, []);

  const changePush = async (enabled: boolean) => {
    setPushError(null);
    setPushInfo(null);
    if (enabled) {
      try {
        const granted = await requestNotificationPermission();
        const registered = granted && token
          ? await syncPushRegistration(token)
          : false;
        setPush(registered);
        if (granted && !registered) setPushError('Не удалось зарегистрировать устройство для push.');
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
          onValueChange={setShareLocationWithDriver}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <SettingToggle
          title="Уведомления"
          subtitle="Новые заказы, назначение и прибытие водителя"
          value={push}
          onValueChange={(value) => void changePush(value)}
        />
        {!!pushError && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
            {pushError}
          </Text>
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
