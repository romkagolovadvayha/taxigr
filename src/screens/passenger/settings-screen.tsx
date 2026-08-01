import { router, type Href } from 'expo-router';
import { type ComponentProps, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { useRideFeedback } from '@/feedback/ride-feedback-provider';
import {
  hasNotificationPermission,
  requestNotificationPermission,
} from '@/notifications/permissions';
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
  const webThumbProps =
    Platform.OS === 'web'
      ? ({ activeThumbColor: '#FFFFFF' } as unknown as Partial<ComponentProps<typeof Switch>>)
      : {};

  return (
    <View style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.x4 }}>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{title}</Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{subtitle}</Text>
      </View>
      <Switch
        {...webThumbProps}
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
    if (Platform.OS === 'web') return;
    void hasNotificationPermission().then(setPush);
  }, []);

  const changePush = async (enabled: boolean) => {
    if (Platform.OS === 'web') {
      setPush(enabled);
      return;
    }
    if (enabled) {
      setPush(await requestNotificationPermission());
    } else {
      await Linking.openSettings();
    }
  };

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Настройки</Text>
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
          subtitle={Platform.OS === 'web' ? 'Доступны в мобильном приложении' : 'Назначение и прибытие водителя'}
          value={push}
          disabled={Platform.OS === 'web'}
          onValueChange={(value) => void changePush(value)}
        />
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Проверить звук и вибрацию"
          accessibilityState={{ disabled: !soundEnabled && !vibrationEnabled }}
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
        </Pressable>
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
        <Pressable
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
        </Pressable>
      </View>
    </Screen>
  );
}
