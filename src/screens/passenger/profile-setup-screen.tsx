import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import {
  ProfileFields,
  type ProfileGender,
} from '@/components/profile/profile-fields';
import { AppButton } from '@/components/ui/app-button';
import { Screen } from '@/components/ui/screen';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export function ProfileSetupScreen() {
  const { user, updateProfile } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<ProfileGender | null>(user?.gender ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const normalizedName = name.trim().replace(/\s+/gu, ' ');
    if (normalizedName.length < 2 || !gender || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ name: normalizedName, gender });
      router.replace('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить профиль');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      contentStyle={{
        minHeight: '100%',
        justifyContent: 'center',
        alignSelf: 'center',
        maxWidth: 560,
      }}
    >
      <View
        style={{
          gap: spacing.x5,
          padding: spacing.x6,
          borderRadius: radius.sheet,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ gap: spacing.x2 }}>
          <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
            ПЕРВЫЙ ВХОД
          </Text>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Расскажите, как к вам обращаться
          </Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            Эти данные будут видны водителю во время заказа. Их можно изменить в профиле.
          </Text>
        </View>

        <ProfileFields
          name={name}
          gender={gender}
          onNameChange={setName}
          onGenderChange={setGender}
          editable={!busy}
        />

        {!!error && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.dangerText }}>
            {error}
          </Text>
        )}
        <AppButton
          loading={busy}
          disabled={name.trim().length < 2 || !gender}
          onPress={() => void save()}
        >
          Сохранить и продолжить
        </AppButton>
      </View>
    </Screen>
  );
}
