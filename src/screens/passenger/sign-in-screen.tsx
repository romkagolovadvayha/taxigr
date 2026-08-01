import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import {
  type MaxAuthChallenge,
  type TelegramAuthChallenge,
  useSession,
} from '@/auth/session-provider';
import { RussianPhoneInput } from '@/components/auth/russian-phone-input';
import { TelegramLogo } from '@/components/auth/telegram-logo';
import { BrandMark } from '@/components/brand-mark';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { AppButton } from '@/components/ui/app-button';
import { Screen } from '@/components/ui/screen';
import type { DemoPersona } from '@/domain/models';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { currentInitialLegalAcceptance, legalDocuments } from '@/legal/documents';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatRetryAfter } from '@/utils/format';
import {
  closePreparedExternalAuthWindow,
  ExternalAuthWindowBlockedError,
  openExternalAuthUrl,
  prepareExternalAuthWindow,
} from '@/utils/open-external-auth';
import {
  isCompleteRussianMobilePhone,
  russianPhoneE164,
} from '@/utils/phone';

type AuthAction = 'max' | 'telegram' | 'sms' | 'code' | null;

const MAX_BRAND_COLOR = '#471AFF';
const TELEGRAM_BRAND_COLOR = '#229ED9';

export function SignInScreen() {
  const { isPhone } = useResponsiveLayout();
  const {
    demoMode,
    authError,
    authenticating,
    clearAuthError,
    startPhoneAuth,
    startMaxPhoneAuth,
    checkMaxPhoneAuth,
    startTelegramPhoneAuth,
    checkTelegramPhoneAuth,
    verifyPhoneAuth,
    continueDemo,
  } = useSession();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [maxChallenge, setMaxChallenge] = useState<MaxAuthChallenge | null>(null);
  const [telegramChallenge, setTelegramChallenge] = useState<TelegramAuthChallenge | null>(null);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [externalWindowError, setExternalWindowError] = useState<string | null>(null);
  const checkingMax = useRef(false);
  const checkingTelegram = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1_000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!maxChallenge) return;
    const check = async () => {
      if (checkingMax.current) return;
      checkingMax.current = true;
      try {
        const status = await checkMaxPhoneAuth(maxChallenge);
        if (status !== 'pending') setMaxChallenge(null);
      } catch {
        // A later poll can recover from a temporary network error.
      } finally {
        checkingMax.current = false;
      }
    };
    const initial = setTimeout(() => void check(), 1_000);
    const timer = setInterval(() => void check(), 2_500);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [checkMaxPhoneAuth, maxChallenge]);

  useEffect(() => {
    if (!telegramChallenge) return;
    const check = async () => {
      if (checkingTelegram.current) return;
      checkingTelegram.current = true;
      try {
        const status = await checkTelegramPhoneAuth(telegramChallenge);
        if (status !== 'pending') setTelegramChallenge(null);
      } catch {
        // A later poll can recover from a temporary network error.
      } finally {
        checkingTelegram.current = false;
      }
    };
    const initial = setTimeout(() => void check(), 1_000);
    const timer = setInterval(() => void check(), 2_500);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [checkTelegramPhoneAuth, telegramChallenge]);

  const acceptance = legalAccepted ? currentInitialLegalAcceptance() : null;
  const phone = russianPhoneE164(phoneDigits);
  const canStart = Boolean(phone && acceptance && !authenticating);
  const visibleAuthError = authError ?? externalWindowError;

  const confirmWithMax = async () => {
    if (!phone || !acceptance || authenticating) return;
    const externalWindow = prepareExternalAuthWindow();
    clearAuthError();
    setExternalWindowError(null);
    setAuthAction('max');
    setMaskedPhone(null);
    setTelegramChallenge(null);
    setCode('');
    setDebugCode(null);
    try {
      const challenge = await startMaxPhoneAuth(phone, acceptance);
      setMaxChallenge(challenge);
      await openExternalAuthUrl(challenge.botUrl, externalWindow);
    } catch (error) {
      closePreparedExternalAuthWindow(externalWindow);
      if (error instanceof ExternalAuthWindowBlockedError) {
        setExternalWindowError('Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.');
      }
    } finally {
      setAuthAction(null);
    }
  };

  const confirmWithTelegram = async () => {
    if (!phone || !acceptance || authenticating) return;
    const externalWindow = prepareExternalAuthWindow();
    clearAuthError();
    setExternalWindowError(null);
    setAuthAction('telegram');
    setMaskedPhone(null);
    setMaxChallenge(null);
    setCode('');
    setDebugCode(null);
    try {
      const challenge = await startTelegramPhoneAuth(phone, acceptance);
      setTelegramChallenge(challenge);
      await openExternalAuthUrl(challenge.appUrl, externalWindow, challenge.botUrl);
    } catch (error) {
      closePreparedExternalAuthWindow(externalWindow);
      if (error instanceof ExternalAuthWindowBlockedError) {
        setExternalWindowError('Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.');
      }
    } finally {
      setAuthAction(null);
    }
  };

  const sendCode = async () => {
    if (!phone || !acceptance || authenticating || cooldown > 0) return;
    clearAuthError();
    setAuthAction('sms');
    setMaxChallenge(null);
    setTelegramChallenge(null);
    try {
      const result = await startPhoneAuth(phone, acceptance);
      setMaskedPhone(result.phone);
      setDebugCode(result.debugCode ?? null);
      setCooldown(result.retryAfterSeconds);
    } catch {
      // The session provider exposes a localized error.
    } finally {
      setAuthAction(null);
    }
  };

  const verifyCode = async () => {
    if (!phone || code.length !== 4 || authenticating) return;
    setAuthAction('code');
    try {
      await verifyPhoneAuth(phone, code);
    } catch {
      // The session provider exposes a localized error.
    } finally {
      setAuthAction(null);
    }
  };

  const enterDemo = (persona: DemoPersona) => {
    if (!acceptance) return;
    void continueDemo(persona, acceptance);
  };

  return (
    <Screen
      contentStyle={{
        minHeight: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacing.x10,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 480,
          gap: spacing.x5,
          alignItems: 'center',
        }}
      >
        <BrandMark size={56} />
        <View
          style={{
            width: '100%',
            backgroundColor: colors.surface,
            borderRadius: radius.sheet,
            borderCurve: 'continuous',
            padding: isPhone ? spacing.x5 : spacing.x8,
            gap: spacing.x5,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Подтверждение телефона
          </Text>

          <RussianPhoneInput
            value={phoneDigits}
            onChange={(value) => {
              setPhoneDigits(value);
              setMaskedPhone(null);
              setMaxChallenge(null);
              setTelegramChallenge(null);
              setCode('');
              setDebugCode(null);
              setExternalWindowError(null);
              clearAuthError();
            }}
            editable={!authenticating}
            onSubmit={() => {
              if (isCompleteRussianMobilePhone(phoneDigits)) void confirmWithMax();
            }}
          />

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

        <View style={{ gap: spacing.x2 }}>
          <AppButton
            loading={authenticating && authAction === 'max'}
            disabled={!canStart || Boolean(maxChallenge || telegramChallenge)}
            onPress={() => void confirmWithMax()}
            foregroundColor="#FFFFFF"
            icon={
              <Image
                source={require('../../../assets/brand/max-logo-white.png')}
                contentFit="contain"
                style={{ width: 26, height: 26 }}
              />
            }
            style={{
              backgroundColor: MAX_BRAND_COLOR,
              boxShadow: '0 8px 22px rgba(71, 26, 255, 0.24)',
            }}
          >
            {maxChallenge ? 'Ждём подтверждение в MAX…' : 'Подтвердить через MAX'}
          </AppButton>
          {maxChallenge && (
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
              В MAX нажмите «Поделиться номером», затем вернитесь в приложение.
            </Text>
          )}
          <AppButton
            loading={authenticating && authAction === 'telegram'}
            disabled={!canStart || Boolean(maxChallenge || telegramChallenge)}
            onPress={() => void confirmWithTelegram()}
            foregroundColor="#FFFFFF"
            icon={<TelegramLogo />}
            style={{
              backgroundColor: TELEGRAM_BRAND_COLOR,
              boxShadow: '0 8px 22px rgba(34, 158, 217, 0.24)',
            }}
          >
            {telegramChallenge
              ? 'Ждём подтверждения в Telegram…'
              : 'Подтвердить через Telegram'}
          </AppButton>
          {telegramChallenge && (
            <View style={{ gap: spacing.x1, alignItems: 'center' }}>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
                В Telegram нажмите «Поделиться номером», затем вернитесь в приложение.
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  const externalWindow = prepareExternalAuthWindow();
                  void openExternalAuthUrl(telegramChallenge.botUrl, externalWindow).catch(() => {
                    closePreparedExternalAuthWindow(externalWindow);
                    setExternalWindowError('Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.');
                  });
                }}
              >
                <Text
                  style={{
                    ...typography.caption,
                    color: TELEGRAM_BRAND_COLOR,
                    textDecorationLine: 'underline',
                    textAlign: 'center',
                  }}
                >
                  Telegram не открылся? Открыть в браузере
                </Text>
              </Pressable>
            </View>
          )}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={maskedPhone ? 'Отправить код по SMS снова' : 'Получить код по SMS без MAX и Telegram'}
            accessibilityState={{ disabled: !canStart || cooldown > 0, busy: authAction === 'sms' }}
            disabled={!canStart || cooldown > 0}
            onPress={() => void sendCode()}
            style={({ pressed }) => ({
              minHeight: 36,
              alignSelf: 'center',
              paddingHorizontal: spacing.x2,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !canStart || cooldown > 0 ? 0.42 : pressed ? 0.65 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
              {authenticating && authAction === 'sms' && (
                <ActivityIndicator size="small" color={colors.inkSecondary} />
              )}
              <Text
                style={{
                  ...typography.caption,
                  color: colors.inkSecondary,
                  textAlign: 'center',
                  textDecorationLine: 'underline',
                }}
              >
                {maskedPhone
                  ? cooldown > 0
                    ? `Отправить SMS снова через ${formatRetryAfter(cooldown)}`
                    : 'Отправить SMS снова'
                  : 'У меня нет MAX и Telegram'}
              </Text>
            </View>
          </Pressable>
        </View>

        {maskedPhone && (
          <View style={{ gap: spacing.x3 }}>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Код отправлен по SMS на {maskedPhone}
            </Text>
            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/\D/gu, '').slice(0, 4));
                clearAuthError();
              }}
              editable={!authenticating}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={4}
              accessibilityLabel="Код из SMS"
              placeholder="0000"
              placeholderTextColor={colors.inkMuted}
              style={{
                ...typography.pageTitle,
                minHeight: 60,
                paddingHorizontal: spacing.x4,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: colors.canvas,
                color: colors.ink,
                letterSpacing: 8,
                textAlign: 'center',
                fontVariant: ['tabular-nums'],
              }}
            />
            {!!debugCode && (
              <Text selectable style={{ ...typography.caption, color: colors.warningText }}>
                Тестовый код: {debugCode}
              </Text>
            )}
            <AppButton
              loading={authenticating && authAction === 'code'}
              disabled={code.length !== 4}
              onPress={() => void verifyCode()}
            >
              Подтвердить код
            </AppButton>
          </View>
        )}

        {visibleAuthError && (
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
              {visibleAuthError}
            </Text>
          </View>
        )}

        {demoMode && (
          <View style={{ gap: spacing.x3, paddingTop: spacing.x2 }}>
            <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
              Демо-вход доступен только в локальной версии
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
              {([
                ['passenger', 'Пассажир'],
                ['driver', 'Водитель'],
                ['admin', 'Суперадмин'],
              ] as const).map(([persona, label]) => (
                <AppButton
                  key={persona}
                  variant="quiet"
                  disabled={!legalAccepted}
                  onPress={() => enterDemo(persona)}
                  style={{ flexGrow: 1, flexBasis: 120 }}
                >
                  {label}
                </AppButton>
              ))}
            </View>
          </View>
        )}
        </View>
      </View>
    </Screen>
  );
}
