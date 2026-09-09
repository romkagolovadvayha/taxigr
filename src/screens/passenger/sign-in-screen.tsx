import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type MaxAuthChallenge,
  type TelegramAuthChallenge,
  type VkAuthChallenge,
  useSession,
} from "@/auth/session-provider";
import { RussianPhoneInput } from "@/components/auth/russian-phone-input";
import { AuthScreenLayout } from "@/components/auth/auth-screen-layout";
import { MaxLogo } from "@/components/auth/max-logo";
import { TelegramLogo } from "@/components/auth/telegram-logo";
import { VkLogo } from "@/components/auth/vk-logo";
import { AppButton } from "@/components/ui/app-button";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { AppIcon } from "@/components/ui/app-icon";
import type { DemoPersona } from "@/domain/models";
import { useAuthViewport } from "@/hooks/use-auth-viewport";
import {
  currentInitialLegalAcceptance,
  legalDocuments,
  type InitialLegalAcceptance,
} from "@/legal/documents";
import { radius, typography } from "@/theme/tokens";
import { formatRetryAfter } from "@/utils/format";
import {
  closePreparedExternalAuthWindow,
  ExternalAuthWindowBlockedError,
  openExternalAuthUrl,
  prepareExternalAuthWindow,
  type PreparedExternalAuthWindow,
} from "@/utils/open-external-auth";
import { russianPhoneE164 } from "@/utils/phone";
import { useThemeColors } from "@/theme/theme-provider";

type AuthAction = "max" | "telegram" | "vk" | "sms" | "code" | null;
type LoginMethod = Exclude<AuthAction, "code" | null> | DemoPersona;

const MAX_BRAND_COLOR = "#471AFF";
const TELEGRAM_BRAND_COLOR = "#229ED9";
const VK_BRAND_COLOR = "#0077FF";
// Link asChild forwards DOM attributes; React Native Web Pressable uses hrefAttrs.
const consentLinkWebProps =
  process.env.EXPO_OS === "web"
    ? { hrefAttrs: { target: "_blank", rel: "noopener noreferrer" } }
    : {};

export function SignInScreen() {
  const colors = useThemeColors();
  const { compact, tight, keyboardOpen } = useAuthViewport();
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
    startVkPhoneAuth,
    checkVkPhoneAuth,
    verifyPhoneAuth,
    continueDemo,
  } = useSession();
  const [phoneDigits, setPhoneDigits] = useState("");
  const [smsLogin, setSmsLogin] = useState(false);
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<LoginMethod | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [maxChallenge, setMaxChallenge] = useState<MaxAuthChallenge | null>(
    null,
  );
  const [telegramChallenge, setTelegramChallenge] =
    useState<TelegramAuthChallenge | null>(null);
  const [vkChallenge, setVkChallenge] = useState<VkAuthChallenge | null>(null);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [externalWindowError, setExternalWindowError] = useState<string | null>(
    null,
  );
  const checkingMax = useRef(false);
  const checkingTelegram = useRef(false);
  const checkingVk = useRef(false);
  const externalAuthWindow = useRef<PreparedExternalAuthWindow>(null);

  const closeExternalAuthWindow = () => {
    closePreparedExternalAuthWindow(externalAuthWindow.current);
    externalAuthWindow.current = null;
  };

  const prepareManagedExternalAuthWindow = () => {
    closeExternalAuthWindow();
    const preparedWindow = prepareExternalAuthWindow();
    externalAuthWindow.current = preparedWindow;
    return preparedWindow;
  };

  useEffect(
    () => () => {
      closePreparedExternalAuthWindow(externalAuthWindow.current);
      externalAuthWindow.current = null;
    },
    [],
  );

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
        if (status !== "pending") {
          closeExternalAuthWindow();
          setMaxChallenge(null);
        }
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
        if (status !== "pending") {
          closeExternalAuthWindow();
          setTelegramChallenge(null);
        }
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

  useEffect(() => {
    if (!vkChallenge) return;
    const check = async () => {
      if (checkingVk.current) return;
      checkingVk.current = true;
      try {
        const status = await checkVkPhoneAuth(vkChallenge);
        if (status !== "pending") {
          closeExternalAuthWindow();
          setVkChallenge(null);
        }
      } catch {
        // A later poll can recover from a temporary network error.
      } finally {
        checkingVk.current = false;
      }
    };
    const initial = setTimeout(() => void check(), 1_000);
    const timer = setInterval(() => void check(), 2_500);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [checkVkPhoneAuth, vkChallenge]);

  const acceptance = legalAccepted ? currentInitialLegalAcceptance() : null;
  const phone = russianPhoneE164(phoneDigits);
  const canStart = Boolean(phone && acceptance && !authenticating);
  const visibleAuthError = authError ?? externalWindowError;

  const confirmWithMax = async (
    confirmedAcceptance: InitialLegalAcceptance,
  ) => {
    if (authenticating) return;
    const externalWindow = prepareManagedExternalAuthWindow();
    clearAuthError();
    setExternalWindowError(null);
    setAuthAction("max");
    setMaskedPhone(null);
    setTelegramChallenge(null);
    setVkChallenge(null);
    setCode("");
    setDebugCode(null);
    try {
      const challenge = await startMaxPhoneAuth(undefined, confirmedAcceptance);
      setMaxChallenge(challenge);
      await openExternalAuthUrl(challenge.botUrl, externalWindow);
    } catch (error) {
      closeExternalAuthWindow();
      if (error instanceof ExternalAuthWindowBlockedError) {
        setExternalWindowError(
          "Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.",
        );
      }
    } finally {
      setAuthAction(null);
    }
  };

  const confirmWithTelegram = async (
    confirmedAcceptance: InitialLegalAcceptance,
  ) => {
    if (authenticating) return;
    const externalWindow = prepareManagedExternalAuthWindow();
    clearAuthError();
    setExternalWindowError(null);
    setAuthAction("telegram");
    setMaskedPhone(null);
    setMaxChallenge(null);
    setVkChallenge(null);
    setCode("");
    setDebugCode(null);
    try {
      const challenge = await startTelegramPhoneAuth(
        undefined,
        confirmedAcceptance,
      );
      setTelegramChallenge(challenge);
      await openExternalAuthUrl(
        challenge.appUrl,
        externalWindow,
        challenge.botUrl,
      );
    } catch (error) {
      closeExternalAuthWindow();
      if (error instanceof ExternalAuthWindowBlockedError) {
        setExternalWindowError(
          "Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.",
        );
      }
    } finally {
      setAuthAction(null);
    }
  };

  const confirmWithVk = async (confirmedAcceptance: InitialLegalAcceptance) => {
    if (authenticating) return;
    const externalWindow = prepareManagedExternalAuthWindow();
    clearAuthError();
    setExternalWindowError(null);
    setAuthAction("vk");
    setMaskedPhone(null);
    setMaxChallenge(null);
    setTelegramChallenge(null);
    setCode("");
    setDebugCode(null);
    try {
      const challenge = await startVkPhoneAuth(undefined, confirmedAcceptance);
      setVkChallenge(challenge);
      await openExternalAuthUrl(challenge.authorizationUrl, externalWindow);
    } catch (error) {
      closeExternalAuthWindow();
      if (error instanceof ExternalAuthWindowBlockedError) {
        setExternalWindowError(
          "Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.",
        );
      }
    } finally {
      setAuthAction(null);
    }
  };

  const sendCode = async () => {
    if (!phone || !acceptance || authenticating || cooldown > 0) return;
    Keyboard.dismiss();
    clearAuthError();
    setExternalWindowError(null);
    setAuthAction("sms");
    closeExternalAuthWindow();
    setMaxChallenge(null);
    setTelegramChallenge(null);
    setVkChallenge(null);
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
    setAuthAction("code");
    try {
      await verifyPhoneAuth(phone, code);
    } catch {
      // The session provider exposes a localized error.
    } finally {
      setAuthAction(null);
    }
  };

  const continueLogin = (
    method: LoginMethod,
    confirmedAcceptance: InitialLegalAcceptance,
  ) => {
    if (method === "max") void confirmWithMax(confirmedAcceptance);
    else if (method === "vk") void confirmWithVk(confirmedAcceptance);
    else if (method === "telegram")
      void confirmWithTelegram(confirmedAcceptance);
    else if (method === "sms") setSmsLogin(true);
    else void continueDemo(method, confirmedAcceptance);
  };

  const chooseLogin = (method: LoginMethod) => {
    if (authenticating) return;
    clearAuthError();
    setExternalWindowError(null);
    if (acceptance) continueLogin(method, acceptance);
    else setPendingLogin(method);
  };

  const acceptAndContinue = () => {
    if (!pendingLogin || authenticating) return;
    const confirmedAcceptance = currentInitialLegalAcceptance();
    setLegalAccepted(true);
    setPendingLogin(null);
    // Keep the provider popup in this click event, before any asynchronous work.
    continueLogin(pendingLogin, confirmedAcceptance);
  };

  const challenge = maxChallenge ?? telegramChallenge ?? vkChallenge;
  const providerName = maxChallenge
    ? "MAX"
    : telegramChallenge
      ? "Telegram"
      : "VK";
  const mode = maskedPhone
    ? "code"
    : challenge
      ? "waiting"
      : pendingLogin
        ? "consent"
        : smsLogin
          ? "phone"
          : "method";
  const gap = tight ? 8 : compact ? 12 : 20;

  const back = () => {
    closeExternalAuthWindow();
    setMaxChallenge(null);
    setTelegramChallenge(null);
    setVkChallenge(null);
    setMaskedPhone(null);
    setCode("");
    setDebugCode(null);
    setPendingLogin(null);
    setExternalWindowError(null);
    clearAuthError();
    if (mode !== "code") setSmsLogin(false);
  };

  const reopenProvider = () => {
    const url =
      maxChallenge?.botUrl ??
      telegramChallenge?.botUrl ??
      vkChallenge?.authorizationUrl;
    if (!url) return;
    const externalWindow = prepareManagedExternalAuthWindow();
    void openExternalAuthUrl(url, externalWindow).catch(() => {
      closeExternalAuthWindow();
      setExternalWindowError(
        "Браузер заблокировал новое окно. Разрешите всплывающие окна и попробуйте снова.",
      );
    });
  };

  const providers = [
    {
      key: "max",
      title: "MAX",
      color: MAX_BRAND_COLOR,
      logo: <MaxLogo size={23} />,
    },
    {
      key: "vk",
      title: "VK",
      color: VK_BRAND_COLOR,
      logo: <VkLogo size={23} />,
    },
    {
      key: "telegram",
      title: "Telegram",
      color: TELEGRAM_BRAND_COLOR,
      logo: <TelegramLogo size={23} />,
    },
  ] as const;
  const heading =
    mode === "consent"
      ? "Перед входом"
      : mode === "phone"
        ? "Войти по номеру"
        : mode === "method"
          ? "Войдём и поедем."
          : mode === "code"
            ? "Введите код"
            : "Подтвердите вход";
  const description =
    mode === "consent"
      ? pendingLogin === "sms"
        ? "Вход по SMS"
        : pendingLogin === "max"
          ? "Вход через MAX"
          : pendingLogin === "vk"
            ? "Вход через VK"
            : pendingLogin === "telegram"
              ? "Вход через Telegram"
              : "Вход в демо-режим"
      : mode === "phone"
        ? "Отправим код подтверждения по SMS."
        : mode === "method"
          ? "Выберите привычный способ входа."
          : mode === "code"
            ? "Отправили SMS на " + maskedPhone
            : "Остался один шаг в " + providerName + ".";

  return (
    <AuthScreenLayout compact={compact} keyboardOpen={keyboardOpen}>
      <View testID="auth-form-content" style={{ gap }}>
        <View style={{ gap: tight ? 4 : 10 }}>
          {mode !== "method" ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={
                mode === "code"
                  ? "Изменить номер телефона"
                  : "Другой способ входа"
              }
              disabled={authenticating}
              onPress={back}
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                minHeight: tight ? 32 : 36,
              }}
            >
              <AppIcon name="back" size={16} color={colors.inkSecondary} />
              <Text
                style={{
                  ...typography.caption,
                  fontSize: 12,
                  color: colors.inkSecondary,
                }}
              >
                {mode === "code" ? "Другой номер" : "Способы входа"}
              </Text>
            </AnimatedPressable>
          ) : (
            !tight && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.brand,
                  }}
                />
                <Text
                  style={{
                    ...typography.micro,
                    fontSize: 9,
                    letterSpacing: 1.8,
                    color: colors.infoText,
                  }}
                >
                  ВАША ПОЕЗДКА НАЧИНАЕТСЯ ЗДЕСЬ
                </Text>
              </View>
            )
          )}
          <Text
            accessibilityRole="header"
            style={{
              ...typography.pageTitle,
              fontSize: tight ? 23 : compact ? 29 : 36,
              lineHeight: tight ? 29 : compact ? 36 : 43,
              letterSpacing: -1.3,
              color: colors.ink,
            }}
          >
            {heading}
          </Text>
          {(!tight ||
            mode === "code" ||
            mode === "waiting" ||
            mode === "consent") && (
            <Text
              style={{
                ...typography.caption,
                fontSize: 12,
                lineHeight: 18,
                color: colors.inkSecondary,
              }}
            >
              {description}
            </Text>
          )}
        </View>

        {mode === "consent" && (
          <>
            <Text
              style={{
                ...typography.caption,
                fontSize: tight ? 11 : 13,
                lineHeight: tight ? 17 : 21,
                color: colors.inkSecondary,
              }}
            >
              Нажимая «Принять и продолжить», я принимаю условия сервиса и
              правила для пассажиров, даю согласие на обработку персональных
              данных и подтверждаю ознакомление с политикой.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                { label: "Условия", document: legalDocuments.terms },
                { label: "Правила", document: legalDocuments.passengerRules },
                {
                  label: "Согласие",
                  document: legalDocuments.personalDataConsent,
                },
                { label: "Политика", document: legalDocuments.privacy },
              ].map(({ label, document }) => (
                <Link
                  key={label}
                  href={document.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  asChild
                >
                  <AnimatedPressable
                    {...consentLinkWebProps}
                    accessibilityRole="link"
                    accessibilityLabel={`Открыть документ «${label}»`}
                    contentStyle={{
                      flexBasis: "47%",
                      flexGrow: 1,
                      minHeight: tight ? 34 : 44,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceSecondary,
                    }}
                  >
                    <AppIcon
                      name="document"
                      size={16}
                      color={colors.infoText}
                    />
                    <Text
                      style={{
                        ...typography.caption,
                        fontSize: 12,
                        color: colors.ink,
                        flex: 1,
                      }}
                    >
                      {label}
                    </Text>
                    <AppIcon name="chevron" size={14} color={colors.inkMuted} />
                  </AnimatedPressable>
                </Link>
              ))}
            </View>
            <AppButton
              compact
              disabled={authenticating}
              onPress={acceptAndContinue}
            >
              Принять и продолжить
            </AppButton>
          </>
        )}

        {mode === "phone" && (
          <>
            <RussianPhoneInput
              compact={compact}
              value={phoneDigits}
              onChange={(value) => {
                setPhoneDigits(value);
                setCode("");
                setDebugCode(null);
                setExternalWindowError(null);
                clearAuthError();
              }}
              editable={!authenticating}
              onSubmit={() => void sendCode()}
            />
            <AppButton
              compact
              disabled={!canStart || cooldown > 0}
              onPress={() => void sendCode()}
              accessibilityLabel="Получить код по SMS"
              loading={authenticating && authAction === "sms"}
            >
              {cooldown > 0
                ? "SMS через " + formatRetryAfter(cooldown)
                : "Получить код по SMS"}
            </AppButton>
          </>
        )}

        {mode === "method" && (
          <>
            <View
              style={{
                flexDirection: tight ? "row" : "column",
                gap: compact ? 8 : 10,
              }}
            >
              {providers.map((provider) => (
                <AnimatedPressable
                  key={provider.key}
                  accessibilityRole="button"
                  accessibilityLabel={"Войти через " + provider.title}
                  accessibilityState={{
                    disabled: authenticating,
                    busy: authenticating && authAction === provider.key,
                  }}
                  disabled={authenticating}
                  onPress={() => chooseLogin(provider.key)}
                  style={{
                    flex: tight ? 1 : undefined,
                    minWidth: 0,
                    minHeight: tight ? 78 : compact ? 50 : 62,
                    paddingHorizontal: tight ? 5 : 14,
                    paddingVertical: tight ? 8 : 6,
                    flexDirection: tight ? "column" : "row",
                    borderRadius: 16,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: tight ? "center" : "flex-start",
                    gap: tight ? 6 : 12,
                    opacity:
                      authenticating && authAction !== provider.key ? 0.5 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      backgroundColor: provider.color,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {authenticating && authAction === provider.key ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      provider.logo
                    )}
                  </View>
                  <Text
                    style={{
                      ...typography.bodyStrong,
                      flex: tight ? undefined : 1,
                      fontSize: tight ? 10 : 14,
                      lineHeight: tight ? 14 : 20,
                      textAlign: tight ? "center" : "left",
                      color: colors.ink,
                    }}
                  >
                    {"Войти через " + provider.title}
                  </Text>
                  {!tight && (
                    <AppIcon name="chevron" size={17} color={colors.inkMuted} />
                  )}
                </AnimatedPressable>
              ))}
            </View>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Войти по SMS"
              disabled={authenticating}
              onPress={() => chooseLogin("sms")}
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              {!tight && (
                <Text
                  style={{
                    ...typography.caption,
                    fontSize: 11,
                    lineHeight: 16,
                    color: colors.inkMuted,
                  }}
                >
                  Нет MAX, VK или Telegram?
                </Text>
              )}
              <Text
                style={{
                  ...typography.bodyStrong,
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.infoText,
                }}
              >
                Войти по SMS
              </Text>
            </AnimatedPressable>
          </>
        )}

        {mode === "code" && (
          <>
            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/\D/gu, "").slice(0, 4));
                clearAuthError();
              }}
              onSubmitEditing={() => void verifyCode()}
              editable={!authenticating}
              keyboardType="number-pad"
              inputMode="numeric"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={4}
              accessibilityLabel="Код из SMS"
              placeholder="0000"
              placeholderTextColor={colors.inkMuted}
              underlineColorAndroid="transparent"
              style={{
                ...typography.pageTitle,
                height: compact ? 58 : 72,
                paddingHorizontal: 20,
                paddingVertical: 0,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSecondary,
                color: colors.ink,
                letterSpacing: 15,
                fontSize: 30,
                textAlign: "center",
                fontVariant: ["tabular-nums"],
              }}
            />
            {!!debugCode && (
              <Text
                selectable
                style={{ ...typography.caption, color: colors.warningText }}
              >
                Тестовый код: {debugCode}
              </Text>
            )}
            <AppButton
              compact
              loading={authenticating && authAction === "code"}
              disabled={code.length !== 4 || authenticating}
              onPress={() => void verifyCode()}
            >
              Подтвердить код
            </AppButton>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Отправить код по SMS снова"
              disabled={!canStart || cooldown > 0}
              onPress={() => void sendCode()}
              style={{
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: !canStart || cooldown > 0 ? 0.55 : 1,
              }}
            >
              <Text
                style={{
                  ...typography.caption,
                  fontSize: 12,
                  color: colors.infoText,
                }}
              >
                {cooldown > 0
                  ? "Отправить снова через " + formatRetryAfter(cooldown)
                  : "Отправить SMS снова"}
              </Text>
            </AnimatedPressable>
          </>
        )}

        {mode === "waiting" && (
          <>
            <View
              style={{
                alignItems: "center",
                paddingVertical: tight ? 0 : 8,
                gap: 14,
              }}
            >
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  backgroundColor: maxChallenge
                    ? MAX_BRAND_COLOR
                    : telegramChallenge
                      ? TELEGRAM_BRAND_COLOR
                      : VK_BRAND_COLOR,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {providers.find((item) => item.title === providerName)?.logo}
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
              >
                <ActivityIndicator size="small" color={colors.infoText} />
                <Text
                  style={{ ...typography.caption, color: colors.inkSecondary }}
                >
                  Ждём подтверждения
                </Text>
              </View>
            </View>
            <Text
              style={{
                ...typography.caption,
                fontSize: 12,
                lineHeight: 19,
                color: colors.inkSecondary,
                textAlign: "center",
              }}
            >
              {maxChallenge
                ? "В MAX нажмите «Поделиться номером», затем вернитесь сюда."
                : telegramChallenge
                  ? "В Telegram нажмите «Запустить», затем «Поделиться номером» и вернитесь сюда."
                  : "Разрешите VK передать номер телефона. Вход завершится автоматически."}
            </Text>
            <AppButton compact onPress={reopenProvider}>
              {"Открыть " + providerName}
            </AppButton>
          </>
        )}

        {visibleAuthError && (
          <View
            accessibilityRole="alert"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: colors.dangerSoft,
            }}
          >
            <Text
              selectable
              style={{
                ...typography.caption,
                fontSize: 11,
                lineHeight: 16,
                color: colors.dangerText,
              }}
            >
              {visibleAuthError}
            </Text>
          </View>
        )}

        {demoMode && mode === "method" && !keyboardOpen && (
          <View style={{ gap: 6, paddingTop: tight ? 0 : 4 }}>
            {!tight && (
              <Text
                style={{
                  ...typography.micro,
                  fontSize: 10,
                  color: colors.inkMuted,
                }}
              >
                Демо-вход · локальная версия
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(
                [
                  ["passenger", "Пассажир"],
                  ["driver", "Водитель"],
                  ["admin", "Суперадмин"],
                ] as const
              ).map(([persona, label]) => (
                <AnimatedPressable
                  key={persona}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  disabled={authenticating}
                  onPress={() => chooseLogin(persona)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 38,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    backgroundColor: colors.surfaceSecondary,
                    opacity: authenticating ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      ...typography.caption,
                      fontSize: 11,
                      color: colors.ink,
                    }}
                  >
                    {label}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </AuthScreenLayout>
  );
}
