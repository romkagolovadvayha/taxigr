import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { resolveApiUrl } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { AppUpdateCard } from '@/components/updates/app-update-card';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { PassengerWorkspace } from '@/components/passenger/passenger-workspace';
import { goBackOrReplace } from '@/navigation/back';
import { motion, radius, spacing, typography } from '@/theme/tokens';
import { formatRussianPhone } from '@/utils/phone';
import { preparePhoto } from '@/utils/prepare-photo';
import { useThemeColors } from '@/theme/theme-provider';

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
  const colors = useThemeColors();
  return (
    <AnimatedPressable
      feedback="subtle"
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
          backgroundColor: colors.transparent,
        }}
      >
        <AppIcon name={icon} size={21} color={colors.inkSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...typography.bodyStrong, fontSize: 15, color: colors.ink }}>{label}</Text>
        {!!subtitle && <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{subtitle}</Text>}
      </View>
      <AppIcon name="chevron" color={colors.inkMuted} size={20} />
    </AnimatedPressable>
  );
}

export function ProfileScreen() {
  const colors = useThemeColors();
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
  const [photoVisible, setPhotoVisible] = useState(false);
  const photoButtonRef = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const previewSize = Math.max(120, Math.min(280, width - 80, height - 360));

  const pickAvatar = async () => {
    if (busy) return;
    setError(null);
    setMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        base64: false,
      });
      if (result.canceled) return;
      const photo = result.assets[0];
      if (!photo) {
        setError('Не удалось прочитать выбранное изображение');
        return;
      }
      setBusy(true);
      const optimized = await preparePhoto(photo, [{ maxDimension: 512, compress: 0.8 }], 5_000_000);
      await uploadAvatar(optimized.base64, optimized.mimeType);
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
    <PassengerWorkspace><Screen style={{ backgroundColor: colors.surface }} contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/')} />
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Профиль</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x4, paddingVertical: spacing.x3 }}>
        <AnimatedPressable
          ref={photoButtonRef}
          accessibilityRole="button"
          accessibilityLabel="Открыть фото профиля"
          accessibilityHint="Посмотреть увеличенное фото или загрузить новое"
          feedback="subtle"
          onPress={() => {
            setMessage(null);
            setError(null);
            setPhotoVisible(true);
          }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 22,
            overflow: 'hidden',
            backgroundColor: colors.brandSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {user?.avatarUrl ? (
            <Image
              source={resolveApiUrl(user.avatarUrl)}
              contentFit="cover"
              transition={motion.duration.standard}
              style={{ width: 64, height: 64 }}
              accessible={false}
              alt=""
              loading="eager"
            />
          ) : (
            <AppIcon name="profile" size={28} color={colors.infoText} />
          )}
        </AnimatedPressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ ...typography.sectionTitle, color: colors.ink }}>{user?.name}</Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{formatRussianPhone(user?.phone ?? '')}</Text>
        </View>
      </View>
      {!!message && !photoVisible && (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ ...typography.caption, color: colors.successText, textAlign: 'center' }}
        >
          {message}
        </Text>
      )}
      {!!error && !photoVisible && (
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
          paddingHorizontal: 0,
          borderTopWidth: 1,
          borderBottomWidth: 1,
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

      <AppUpdateCard />
      <AppButton variant="secondary" onPress={() => void signOut()}>Выйти</AppButton>
      <AppModal
        visible={photoVisible}
        title="Фото профиля"
        onClose={() => setPhotoVisible(false)}
        returnFocusRef={photoButtonRef}
      >
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ alignItems: 'center', gap: spacing.x4 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: previewSize, height: previewSize, borderRadius: radius.card,
            overflow: 'hidden', backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', gap: spacing.x3 }}>
            {user?.avatarUrl ? (
              <Image
                source={resolveApiUrl(user.avatarUrl)}
                contentFit="contain"
                loading="eager"
                transition={motion.duration.standard}
                accessibilityLabel="Фото профиля в увеличенном виде"
                style={{ width: previewSize, height: previewSize }}
              />
            ) : (
              <>
                <AppIcon name="profile" size={72} color={colors.infoText} />
                <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Фото ещё не добавлено</Text>
              </>
            )}
          </View>
          <View style={{ width: '100%', gap: spacing.x2 }}>
            <AppButton loading={busy} onPress={() => void pickAvatar()}>Загрузить новое фото</AppButton>
            {!!user?.avatarUrl && (
              <AppButton compact variant="quiet" disabled={busy} onPress={() => void clearAvatar()}>Удалить фото</AppButton>
            )}
          </View>
          {!!message && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.successText, textAlign: 'center' }}>{message}</Text>}
          {!!error && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.dangerText, textAlign: 'center' }}>{error}</Text>}
        </ScrollView>
      </AppModal>
    </Screen></PassengerWorkspace>
  );
}
