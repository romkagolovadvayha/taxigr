import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { resolveApiUrl } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatRussianPhone } from '@/utils/phone';
import { detectAvatarMimeType } from '@/utils/avatar';

function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
          backgroundColor: colors.canvas,
        }}
      >
        <AppIcon name={icon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{label}</Text>
        {!!subtitle && <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{subtitle}</Text>}
      </View>
      <AppIcon name="chevron" color={colors.inkMuted} size={20} />
    </Pressable>
  );
}

export function ProfileScreen() {
  const {
    user,
    signOut,
    uploadAvatar,
    removeAvatar,
  } = useSession();
  const canDrive = user?.roles.includes('driver');
  const isAdmin = user?.roles.includes('admin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickAvatar = async () => {
    if (busy) return;
    setError(null);
    setMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.65,
      base64: true,
    });
    if (result.canceled) return;
    const base64 = result.assets[0]?.base64;
    if (!base64) {
      setError('Не удалось прочитать выбранное изображение');
      return;
    }
    const mimeType = detectAvatarMimeType(base64);
    if (!mimeType) {
      setError('Поддерживаются изображения JPG, PNG и WebP');
      return;
    }
    setBusy(true);
    try {
      await uploadAvatar(base64, mimeType);
      setMessage('Аватар обновлён');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить аватар');
    } finally {
      setBusy(false);
    }
  };

  const clearAvatar = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await removeAvatar();
      setMessage('Аватар удалён');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить аватар');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Профиль</Text>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x3 }}>
        <View
          style={{
            width: 112,
            height: 112,
            borderRadius: 56,
            overflow: 'hidden',
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {user?.avatarUrl ? (
            <Image
              source={resolveApiUrl(user.avatarUrl)}
              contentFit="cover"
              transition={180}
              style={{ width: 112, height: 112 }}
              accessibilityLabel="Аватар пользователя"
            />
          ) : (
            <AppIcon name="profile" size={48} color={colors.brandInk} />
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2, justifyContent: 'center' }}>
          <AppButton
            fullWidth={false}
            variant="secondary"
            loading={busy}
            onPress={() => void pickAvatar()}
          >
            {user?.avatarUrl ? 'Сменить фото' : 'Загрузить фото'}
          </AppButton>
          {!!user?.avatarUrl && (
            <AppButton
              fullWidth={false}
              variant="quiet"
              disabled={busy}
              onPress={() => void clearAvatar()}
            >
              Удалить фото
            </AppButton>
          )}
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          {formatRussianPhone(user?.phone ?? '')}
        </Text>
      </View>

      {!!message && (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ ...typography.caption, color: colors.successText, textAlign: 'center' }}
        >
          {message}
        </Text>
      )}
      {!!error && (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ ...typography.caption, color: colors.dangerText, textAlign: 'center' }}
        >
          {error}
        </Text>
      )}

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          paddingHorizontal: spacing.x4,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <MenuRow
          icon="profile"
          label="Личные данные"
          subtitle="Имя, фамилия и пол"
          onPress={() => router.push('/personal-data')}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <MenuRow icon="orders" label="Мои поездки" onPress={() => router.push('/orders')} />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <MenuRow icon="settings" label="Настройки" onPress={() => router.push('/settings')} />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <MenuRow
          icon="car"
          label={canDrive ? 'Кабинет водителя' : 'Стать водителем'}
          subtitle={canDrive ? 'Заказы, смена и заработок' : 'Отправить заявку суперадмину'}
          onPress={() => router.push(canDrive ? '/driver' : '/driver-application')}
        />
        {isAdmin && (
          <>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <MenuRow icon="shield" label="Панель суперадмина" onPress={() => router.push('/admin')} />
          </>
        )}
      </View>

      <AppButton variant="secondary" onPress={() => void signOut()}>Выйти</AppButton>
    </Screen>
  );
}
