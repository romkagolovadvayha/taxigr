import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { Screen } from '@/components/ui/screen';
import { BrandMark } from '@/components/brand-mark';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';
import { getVkMiniAppLaunchParams } from '@/vk-mini-app/bridge';
import { vkNativeLoginCode } from '@/vk-mini-app/native-login';

export function VkNativeLoginConfirmation({ state, token }: { state: string; token: string }) {
  const colors = useThemeColors();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (submitting.current || confirmed) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/v1/auth/vk/native/confirm', {
        method: 'POST',
        token,
        body: JSON.stringify({ state, launchParams: getVkMiniAppLaunchParams() }),
      });
      setConfirmed(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось подтвердить вход.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ minHeight: '100%', justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 360, gap: spacing.x4, alignItems: 'center' }}>
        <BrandMark size={56} />
        <Text style={{ ...typography.pageTitle, color: colors.ink, textAlign: 'center' }}>
          {confirmed ? 'Вход подтверждён' : 'Войти в приложение такси?'}
        </Text>
        <Text style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
          {confirmed
            ? 'Вернитесь в приложение «Такси Грахово» на Android. Вход завершится автоматически.'
            : 'Подтвердите вход, если вы начали его в приложении «Такси Грахово» на Android и код совпадает.'}
        </Text>
        {!confirmed && (
          <>
            <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>
              {vkNativeLoginCode(state)}
            </Text>
            <AppButton loading={busy} onPress={() => void confirm()} style={{ alignSelf: 'stretch' }}>
              Подтвердить вход
            </AppButton>
            <Text style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
              Чтобы отказаться, закройте это окно.
            </Text>
          </>
        )}
        {error && (
          <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.danger }}>
            {error}
          </Text>
        )}
      </View>
    </Screen>
  );
}
