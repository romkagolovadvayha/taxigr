import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import {
  ProfileFields,
  type ProfileGender,
} from '@/components/profile/profile-fields';
import { AppButton } from '@/components/ui/app-button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export function PersonalDataScreen() {
  const { user, updateProfile } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<ProfileGender | null>(user?.gender ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveProfile = async () => {
    const normalizedName = name.trim().replace(/\s+/gu, ' ');
    if (normalizedName.length < 2 || !gender || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfile({ name: normalizedName, gender });
      setName(normalizedName);
      setMessage('Данные профиля сохранены');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить профиль');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Личные данные
        </Text>
      </View>

      <View
        style={{
          gap: spacing.x4,
          padding: spacing.x5,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <ProfileFields
          name={name}
          gender={gender}
          onNameChange={(value) => {
            setName(value);
            setMessage(null);
            setError(null);
          }}
          onGenderChange={(value) => {
            setGender(value);
            setMessage(null);
            setError(null);
          }}
          editable={!busy}
        />
        <AppButton
          loading={busy}
          disabled={name.trim().length < 2 || !gender}
          onPress={() => void saveProfile()}
        >
          Сохранить изменения
        </AppButton>
        {!!message && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.successText }}>
            {message}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.dangerText }}>
            {error}
          </Text>
        )}
      </View>
    </Screen>
  );
}
