import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { BrandMark } from '@/components/brand-mark';
import { AppButton } from '@/components/ui/app-button';
import { Screen } from '@/components/ui/screen';
import { BlockedAccountScreen } from '@/screens/blocked-account-screen';
import { OrderScreen } from '@/screens/passenger/order-screen';
import { colors, spacing, typography } from '@/theme/tokens';
import {
  allowVkCommunityMessages,
  getVkMiniAppLaunchParams,
  initializeVkMiniApp,
  requestVkMiniAppPhone,
  requestVkMiniAppProfile,
} from '@/vk-mini-app/bridge';

export function VkMiniAppScreen() {
  const {
    user,
    token,
    sessionReady,
    authenticating,
    authError,
    clearAuthError,
    signInWithVkMiniApp,
    verifyVkMiniAppSession,
    resetSessionForEmbeddedAuth,
  } = useSession();
  const [sessionVerified, setSessionVerified] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const started = useRef(false);

  const authorize = useCallback(async () => {
    setAuthorizing(true);
    setBridgeError(null);
    clearAuthError();
    try {
      await initializeVkMiniApp();
      const launchParams = getVkMiniAppLaunchParams();
      if (!launchParams) throw new Error('Параметры запуска VK отсутствуют.');

      if (user && token) {
        const verified = await verifyVkMiniAppSession(launchParams);
        if (verified) {
          setSessionVerified(true);
          return;
        }
        await resetSessionForEmbeddedAuth();
      }

      const identity = await requestVkMiniAppProfile();
      try {
        await signInWithVkMiniApp({ ...identity, messagesPermissionGranted: false });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'VK_MINI_APP_PHONE_REQUIRED') {
          throw error;
        }
        const phone = await requestVkMiniAppPhone();
        const messagesPermissionGranted = await allowVkCommunityMessages();
        await signInWithVkMiniApp({ ...identity, ...phone, messagesPermissionGranted });
      }
      setSessionVerified(true);
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : 'Не удалось выполнить вход через VK.');
    } finally {
      setAuthorizing(false);
    }
  }, [
    clearAuthError,
    resetSessionForEmbeddedAuth,
    signInWithVkMiniApp,
    token,
    user,
    verifyVkMiniAppSession,
  ]);

  useEffect(() => {
    if (!sessionReady || started.current) return;
    started.current = true;
    void authorize();
  }, [authorize, sessionReady]);

  if (user && sessionVerified) {
    return user.blockedAt ? <BlockedAccountScreen /> : <OrderScreen />;
  }

  const visibleError = bridgeError ?? authError;
  return (
    <Screen
      contentStyle={{
        minHeight: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacing.x8,
      }}
    >
      <View style={{ width: '100%', maxWidth: 360, gap: spacing.x4, alignItems: 'center' }}>
        <BrandMark size={56} />
        {!visibleError ? (
          <>
            <ActivityIndicator size="small" color={colors.inkSecondary} />
            <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
              Входим через VK…
            </Text>
          </>
        ) : (
          <>
            <Text
              accessibilityRole="alert"
              selectable
              style={{ ...typography.body, color: colors.danger, textAlign: 'center' }}
            >
              {visibleError}
            </Text>
            <AppButton
              loading={authorizing || authenticating}
              onPress={() => void authorize()}
              style={{ alignSelf: 'stretch' }}
            >
              Повторить
            </AppButton>
          </>
        )}
      </View>
    </Screen>
  );
}
