import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { nativeMessengerReturnUrl, parseMessengerReturn, resumeMessengerLogin } from '@/auth/messenger-return';
import { BrandMark } from '@/components/brand-mark';
import { AppButton } from '@/components/ui/app-button';
import { Screen } from '@/components/ui/screen';
import { readSessionToken } from '@/storage/auth-storage';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';

export function MessengerAuthReturnScreen() {
  const { provider, challenge, target } = useLocalSearchParams<{ provider?: string; challenge?: string; target?: string }>();
  const { user, sessionReady, checkMaxPhoneAuth, checkTelegramPhoneAuth, checkVkPhoneAuth } = useSession();
  const colors = useThemeColors();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Завершаем вход в Такси Грахово…');
  const openNative = process.env.EXPO_OS === 'web' && (target === 'android' || target === 'ios');

  const proceed = useCallback(async () => {
    if (!sessionReady || inFlight.current) return;
    const input = parseMessengerReturn(provider, challenge);
    if (!input) {
      setMessage('Ссылка устарела или повреждена. Начните вход заново.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      if (openNative) {
        setMessage('Открываем приложение такси. Если переход не произошёл, нажмите кнопку ниже.');
        await Linking.openURL(nativeMessengerReturnUrl(input));
        return;
      }
      if (user) {
        router.replace(user.profileComplete ? '/' : '/profile-setup');
        return;
      }
      const verify = input.provider === 'max' ? checkMaxPhoneAuth : input.provider === 'telegram' ? checkTelegramPhoneAuth : checkVkPhoneAuth;
      const status = await resumeMessengerLogin(input, verify);
      if (status === 'verified') return; // Session state handles navigation on the next render.
      if (status === 'missing') {
        // The original tab may have finished login while this tab was loading.
        if (process.env.EXPO_OS === 'web' && await readSessionToken()) {
          window.location.replace('/');
          return;
        }
        setMessage('Откройте эту ссылку в браузере, где начинали вход: в меню мессенджера выберите «Открыть в браузере». Если попытка уже устарела, начните вход заново.');
      } else if (status === 'pending') {
        setMessage('Подтверждение ещё обрабатывается. Убедитесь, что вы поделились номером в боте, и нажмите «Продолжить вход».');
      } else {
        setMessage('Не удалось завершить эту попытку входа. Начните вход заново.');
      }
    } catch {
      setMessage(openNative
        ? 'Нажмите «Открыть приложение», чтобы продолжить вход в Такси Грахово.'
        : 'Не удалось проверить вход. Проверьте интернет и нажмите «Продолжить вход».');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [sessionReady, provider, challenge, openNative, user, checkMaxPhoneAuth, checkTelegramPhoneAuth, checkVkPhoneAuth]);

  useEffect(() => {
    const timer = setTimeout(() => void proceed(), 0);
    return () => clearTimeout(timer);
  }, [proceed]);

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 420, gap: spacing.x4, alignItems: 'center' }}>
        <BrandMark size={56} />
        <Text style={{ ...typography.pageTitle, color: colors.ink, textAlign: 'center' }}>Продолжить в Такси Грахово</Text>
        <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>{message}</Text>
        <AppButton loading={busy || !sessionReady} onPress={() => void proceed()} style={{ alignSelf: 'stretch' }}>
          {openNative ? 'Открыть приложение' : 'Продолжить вход'}
        </AppButton>
        <AppButton variant="secondary" onPress={() => router.replace('/sign-in')} style={{ alignSelf: 'stretch' }}>
          {openNative ? 'Войти на сайте' : 'Начать вход заново'}
        </AppButton>
      </View>
    </Screen>
  );
}
