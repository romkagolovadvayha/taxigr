import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { VkLogo } from '@/components/auth/vk-logo';
import { BrandMark } from '@/components/brand-mark';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { AppButton } from '@/components/ui/app-button';
import { Screen } from '@/components/ui/screen';
import { currentInitialLegalAcceptance, legalDocuments } from '@/legal/documents';
import { OrderScreen } from '@/screens/passenger/order-screen';
import { BlockedAccountScreen } from '@/screens/blocked-account-screen';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import {
  allowVkCommunityMessages,
  getVkMiniAppLaunchParams,
  initializeVkMiniApp,
  requestVkMiniAppIdentity,
} from '@/vk-mini-app/bridge';

const VK_BRAND_COLOR = '#0077FF';

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
  const [bridgeReady, setBridgeReady] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    void initializeVkMiniApp()
      .then(async () => {
        const launchParams = getVkMiniAppLaunchParams();
        if (!launchParams) throw new Error('Параметры запуска VK отсутствуют.');
        if (user && token) {
          const verified = await verifyVkMiniAppSession(launchParams);
          if (!verified) await resetSessionForEmbeddedAuth();
          if (active) setSessionVerified(verified);
        }
        if (active) {
          setBridgeReady(true);
          setSessionChecked(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSessionChecked(true);
          setBridgeError(error instanceof Error ? error.message : 'Не удалось открыть VK Mini App.');
        }
      });
    return () => {
      active = false;
    };
  }, [resetSessionForEmbeddedAuth, sessionReady, token, user, verifyVkMiniAppSession]);

  if (user && sessionVerified) {
    return user.blockedAt ? <BlockedAccountScreen /> : <OrderScreen />;
  }

  const signIn = async () => {
    if (!bridgeReady || !legalAccepted || authenticating) return;
    clearAuthError();
    setBridgeError(null);
    try {
      const identity = await requestVkMiniAppIdentity();
      const messagesPermissionGranted = await allowVkCommunityMessages();
      await signInWithVkMiniApp({
        ...identity,
        messagesPermissionGranted,
        legalAcceptance: currentInitialLegalAcceptance(),
      });
      setSessionVerified(true);
    } catch (error) {
      if (error instanceof Error) setBridgeError(error.message);
    }
  };

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
      <View style={{ width: '100%', maxWidth: 480, gap: spacing.x5, alignItems: 'center' }}>
        <BrandMark label="ВКонтакте" size={56} />
        <View
          style={{
            width: '100%',
            padding: spacing.x6,
            gap: spacing.x5,
            borderRadius: radius.sheet,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ alignItems: 'center', gap: spacing.x2 }}>
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: VK_BRAND_COLOR,
              }}
            >
              <VkLogo size={34} />
            </View>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink, textAlign: 'center' }}>
              Закажите такси прямо во ВКонтакте
            </Text>
            <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
              VK попросит подтвердить номер телефона и разрешить сообщения сообщества со статусами поездки.
            </Text>
          </View>

          <ConsentCheckbox
            checked={legalAccepted}
            onChange={setLegalAccepted}
            compactLinks
            label="Принимаю условия сервиса и даю согласие на обработку данных."
            links={[
              { label: 'Условия', href: legalDocuments.terms.path },
              { label: 'Правила', href: legalDocuments.passengerRules.path },
              { label: 'Согласие', href: legalDocuments.personalDataConsent.path },
              { label: 'Политика', href: legalDocuments.privacy.path },
            ]}
          />

          <AppButton
            loading={authenticating}
            disabled={!bridgeReady || !legalAccepted}
            foregroundColor="#FFFFFF"
            icon={<VkLogo size={27} />}
            onPress={() => void signIn()}
            style={{ backgroundColor: VK_BRAND_COLOR }}
          >
            Продолжить через VK
          </AppButton>

          {(!bridgeReady || !sessionChecked) && !visibleError && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.x2 }}>
              <ActivityIndicator size="small" color={colors.inkSecondary} />
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                Подключаемся к VK…
              </Text>
            </View>
          )}

          {visibleError && (
            <View
              accessibilityRole="alert"
              style={{
                paddingHorizontal: spacing.x4,
                paddingVertical: spacing.x3,
                borderRadius: radius.md,
                backgroundColor: colors.dangerSoft,
              }}
            >
              <Text selectable style={{ ...typography.caption, color: colors.dangerText, textAlign: 'center' }}>
                {visibleError}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
