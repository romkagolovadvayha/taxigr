import { router } from 'expo-router';
import type { ReactNode } from 'react';
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import type { DemoPersona, SessionUser, UserRole } from '@/domain/models';
import type { InitialLegalAcceptance } from '@/legal/documents';
import { syncDriverBackgroundLocation } from '@/location/driver-background-location';
import { clearSessionToken, readSessionToken, writeSessionToken } from '@/storage/auth-storage';
import { getInstallationId } from '@/storage/device-id';

type PhoneAuthStartResult = {
  phone: string;
  expiresInSeconds: number;
  retryAfterSeconds: number;
  debugCode?: string;
};

export type MaxAuthChallenge = {
  challengeId: string;
  exchangeToken: string;
  botUrl: string;
  expiresInSeconds: number;
};

export type TelegramAuthChallenge = MaxAuthChallenge & {
  appUrl: string;
};

export type VkAuthChallenge = Omit<MaxAuthChallenge, 'botUrl'> & {
  authorizationUrl: string;
  communityUrl: string;
};

type MaxAuthStatus =
  | { status: 'pending' | 'expired' }
  | { status: 'failed'; errorCode: string }
  | { status: 'verified'; token: string; user: SessionUser };

type VkAuthStatus =
  | Exclude<MaxAuthStatus, { status: 'verified' }>
  | {
    status: 'verified';
    token: string;
    user: SessionUser;
    communityPrompt?: { url: string };
  };

type SessionContextValue = {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
  sessionReady: boolean;
  authenticating: boolean;
  authError: string | null;
  vkCommunityPromptUrl: string | null;
  demoMode: boolean;
  startPhoneAuth: (
    phone: string,
    legalAcceptance: InitialLegalAcceptance,
  ) => Promise<PhoneAuthStartResult>;
  startMaxPhoneAuth: (
    phone: string,
    legalAcceptance: InitialLegalAcceptance,
  ) => Promise<MaxAuthChallenge>;
  checkMaxPhoneAuth: (challenge: MaxAuthChallenge) => Promise<MaxAuthStatus['status']>;
  startTelegramPhoneAuth: (
    phone: string,
    legalAcceptance: InitialLegalAcceptance,
  ) => Promise<TelegramAuthChallenge>;
  checkTelegramPhoneAuth: (challenge: TelegramAuthChallenge) => Promise<MaxAuthStatus['status']>;
  startVkPhoneAuth: (
    phone: string,
    legalAcceptance: InitialLegalAcceptance,
  ) => Promise<VkAuthChallenge>;
  checkVkPhoneAuth: (challenge: VkAuthChallenge) => Promise<VkAuthStatus['status']>;
  verifyPhoneAuth: (phone: string, code: string) => Promise<void>;
  continueDemo: (
    persona: DemoPersona | undefined,
    legalAcceptance: InitialLegalAcceptance,
  ) => Promise<void>;
  updateProfile: (input: {
    name: string;
    gender: 'male' | 'female';
  }) => Promise<SessionUser>;
  uploadAvatar: (base64: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => Promise<void>;
  removeAvatar: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  dismissVkCommunityPrompt: () => void;
  clearAuthError: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const demoEnabled = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

function demoUser(persona: DemoPersona = 'passenger'): SessionUser {
  const role: UserRole = persona;
  const roles: UserRole[] =
    role === 'admin'
      ? ['passenger', 'driver', 'admin']
      : role === 'driver'
        ? ['passenger', 'driver']
        : ['passenger'];
  return {
    id: `demo-${persona}`,
    name:
      role === 'admin'
        ? 'Суперадмин'
        : role === 'driver'
          ? 'Алексей Водитель'
          : 'Дмитрий Петров',
    gender: 'male',
    phone: '+79120000000',
    profileComplete: true,
    roles,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(Platform.OS !== 'web');
  const [sessionReady, setSessionReady] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [vkCommunityPromptUrl, setVkCommunityPromptUrl] = useState<string | null>(null);

  const applySession = useCallback(async (result: { token: string; user: SessionUser }) => {
    await writeSessionToken(result.token);
    setToken(result.token);
    setUser(result.user);
    setAuthError(null);
  }, []);

  const restore = useCallback(async () => {
    try {
      const stored = await readSessionToken();
      if (!stored) return;
      setLoading(true);
      if (stored.startsWith('demo:') && demoEnabled) {
        const storedPersona = stored.slice(5);
        const persona: DemoPersona =
          storedPersona === 'driver' || storedPersona === 'admin' ? storedPersona : 'passenger';
        setToken(stored);
        setUser(demoUser(persona));
        return;
      }
      const refreshed = await apiRequest<{ token: string; user: SessionUser }>(
        '/v1/auth/refresh',
        { method: 'POST', token: stored },
      );
      await applySession(refreshed);
    } catch {
      await clearSessionToken();
      await syncDriverBackgroundLocation(false).catch(() => undefined);
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  }, [applySession]);

  useEffect(() => {
    const timer = setTimeout(() => void restore(), 0);
    return () => clearTimeout(timer);
  }, [restore]);

  const startPhoneAuth = useCallback(
    async (phone: string, legalAcceptance: InitialLegalAcceptance) => {
      setAuthenticating(true);
      setAuthError(null);
      try {
        const installationId = await getInstallationId();
        return await apiRequest<PhoneAuthStartResult>('/v1/auth/phone/start', {
          method: 'POST',
          body: JSON.stringify({ phone, legalAcceptance, installationId }),
        });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Не удалось отправить код. Проверьте соединение.';
        setAuthError(message);
        throw error;
      } finally {
        setAuthenticating(false);
      }
    },
    [],
  );

  const startMaxPhoneAuth = useCallback(
    async (phone: string, legalAcceptance: InitialLegalAcceptance) => {
      setAuthenticating(true);
      setAuthError(null);
      try {
        const installationId = await getInstallationId();
        return await apiRequest<MaxAuthChallenge>('/v1/auth/max/start', {
          method: 'POST',
          body: JSON.stringify({ phone, legalAcceptance, installationId }),
        });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Не удалось открыть подтверждение через MAX.';
        setAuthError(message);
        throw error;
      } finally {
        setAuthenticating(false);
      }
    },
    [],
  );

  const checkMaxPhoneAuth = useCallback(
    async (challenge: MaxAuthChallenge): Promise<MaxAuthStatus['status']> => {
      try {
        const installationId = await getInstallationId();
        const result = await apiRequest<MaxAuthStatus>('/v1/auth/max/status', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            exchangeToken: challenge.exchangeToken,
            installationId,
          }),
        });
        if (result.status === 'expired') {
          setAuthError('Подтверждение через MAX устарело. Попробуйте ещё раз.');
        } else if (result.status === 'failed') {
          setAuthError(
            result.errorCode === 'PHONE_MISMATCH'
              ? 'Номер в MAX не совпадает с указанным номером.'
              : 'Не удалось подтвердить номер через MAX.',
          );
        } else if (result.status === 'verified') {
          await applySession(result);
          if (!result.user.profileComplete) router.replace('/profile-setup');
        }
        return result.status;
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Не удалось проверить подтверждение через MAX.';
        setAuthError(message);
        throw error;
      }
    },
    [applySession],
  );

  const startTelegramPhoneAuth = useCallback(
    async (phone: string, legalAcceptance: InitialLegalAcceptance) => {
      setAuthenticating(true);
      setAuthError(null);
      try {
        const installationId = await getInstallationId();
        return await apiRequest<TelegramAuthChallenge>('/v1/auth/telegram/start', {
          method: 'POST',
          body: JSON.stringify({ phone, legalAcceptance, installationId }),
        });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Не удалось открыть подтверждение через Telegram.';
        setAuthError(message);
        throw error;
      } finally {
        setAuthenticating(false);
      }
    },
    [],
  );

  const checkTelegramPhoneAuth = useCallback(
    async (challenge: TelegramAuthChallenge): Promise<MaxAuthStatus['status']> => {
      try {
        const installationId = await getInstallationId();
        const result = await apiRequest<MaxAuthStatus>('/v1/auth/telegram/status', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            exchangeToken: challenge.exchangeToken,
            installationId,
          }),
        });
        if (result.status === 'expired') {
          setAuthError('Подтверждение через Telegram устарело. Попробуйте ещё раз.');
        } else if (result.status === 'failed') {
          setAuthError(
            result.errorCode === 'PHONE_MISMATCH'
              ? 'Номер в Telegram не совпадает с указанным номером.'
              : 'Не удалось подтвердить номер через Telegram.',
          );
        } else if (result.status === 'verified') {
          await applySession(result);
          if (!result.user.profileComplete) router.replace('/profile-setup');
        }
        return result.status;
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Не удалось проверить подтверждение через Telegram.';
        setAuthError(message);
        throw error;
      }
    },
    [applySession],
  );

  const startVkPhoneAuth = useCallback(
    async (phone: string, legalAcceptance: InitialLegalAcceptance) => {
      setAuthenticating(true);
      setAuthError(null);
      try {
        const installationId = await getInstallationId();
        return await apiRequest<VkAuthChallenge>('/v1/auth/vk/start', {
          method: 'POST',
          body: JSON.stringify({ phone, legalAcceptance, installationId }),
        });
      } catch (error) {
        const message = error instanceof ApiError
          ? error.message
          : 'Не удалось открыть вход через VK.';
        setAuthError(message);
        throw error;
      } finally {
        setAuthenticating(false);
      }
    },
    [],
  );

  const checkVkPhoneAuth = useCallback(
    async (challenge: VkAuthChallenge): Promise<VkAuthStatus['status']> => {
      try {
        const installationId = await getInstallationId();
        const result = await apiRequest<VkAuthStatus>('/v1/auth/vk/status', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            exchangeToken: challenge.exchangeToken,
            installationId,
          }),
        });
        if (result.status === 'expired') {
          setAuthError('Подтверждение через VK устарело. Попробуйте ещё раз.');
        } else if (result.status === 'failed') {
          setAuthError(
            result.errorCode === 'PHONE_MISMATCH'
              ? 'Номер в VK не совпадает с указанным номером.'
              : result.errorCode === 'PHONE_NOT_SHARED'
                ? 'Разрешите VK передать номер телефона для безопасного входа.'
                : 'Не удалось подтвердить вход через VK.',
          );
        } else if (result.status === 'verified') {
          await applySession(result);
          setVkCommunityPromptUrl(result.communityPrompt?.url ?? null);
          if (!result.user.profileComplete) router.replace('/profile-setup');
        }
        return result.status;
      } catch (error) {
        const message = error instanceof ApiError
          ? error.message
          : 'Не удалось проверить подтверждение через VK.';
        setAuthError(message);
        throw error;
      }
    },
    [applySession],
  );

  const verifyPhoneAuth = useCallback(
    async (phone: string, code: string) => {
      setAuthenticating(true);
      setAuthError(null);
      try {
        const installationId = await getInstallationId();
        const result = await apiRequest<{ token: string; user: SessionUser }>(
          '/v1/auth/phone/verify',
          {
            method: 'POST',
            body: JSON.stringify({ phone, code, installationId }),
          },
        );
        await applySession(result);
        if (!result.user.profileComplete) router.replace('/profile-setup');
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Не удалось подтвердить код. Проверьте соединение.';
        setAuthError(message);
        throw error;
      } finally {
        setAuthenticating(false);
      }
    },
    [applySession],
  );

  const continueDemo = useCallback(async (
    persona: DemoPersona = 'passenger',
    _legalAcceptance: InitialLegalAcceptance,
  ) => {
    if (!demoEnabled) return;
    const demoToken = `demo:${persona}`;
    await writeSessionToken(demoToken);
    setToken(demoToken);
    setUser(demoUser(persona));
    router.replace(persona === 'admin' ? '/admin' : persona === 'driver' ? '/driver' : '/');
  }, []);

  const updateProfile = useCallback(async (input: {
    name: string;
    gender: 'male' | 'female';
  }) => {
    if (!token) throw new ApiError('Требуется авторизация', 401, 'UNAUTHORIZED');
    if (token.startsWith('demo:')) {
      const next = {
        ...(user ?? demoUser()),
        ...input,
        profileComplete: true,
      };
      setUser(next);
      return next;
    }
    const next = await apiRequest<SessionUser>('/v1/me/profile', {
      method: 'PUT',
      token,
      body: JSON.stringify(input),
    });
    setUser(next);
    return next;
  }, [token, user]);

  const uploadAvatar = useCallback(async (
    base64: string,
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  ) => {
    if (!token) throw new ApiError('Требуется авторизация', 401, 'UNAUTHORIZED');
    if (token.startsWith('demo:')) {
      setUser((current) =>
        current ? { ...current, avatarUrl: `data:${mimeType};base64,${base64}` } : current,
      );
      return;
    }
    const next = await apiRequest<SessionUser>('/v1/me/avatar', {
      method: 'PUT',
      token,
      timeoutMs: 30_000,
      body: JSON.stringify({ base64, mimeType }),
    });
    setUser(next);
  }, [token]);

  const removeAvatar = useCallback(async () => {
    if (!token) return;
    if (token.startsWith('demo:')) {
      setUser((current) => current ? { ...current, avatarUrl: undefined } : current);
      return;
    }
    const next = await apiRequest<SessionUser>('/v1/me/avatar', {
      method: 'DELETE',
      token,
    });
    setUser(next);
  }, [token]);

  const signOut = useCallback(async () => {
    await syncDriverBackgroundLocation(false).catch(() => undefined);
    await clearSessionToken();
    setToken(null);
    setUser(null);
    setAuthError(null);
    setVkCommunityPromptUrl(null);
    router.replace('/sign-in');
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token || token.startsWith('demo:')) return;
    const refreshed = await apiRequest<{ token: string; user: SessionUser }>(
      '/v1/auth/refresh',
      { method: 'POST', token },
    );
    await applySession(refreshed);
  }, [applySession, token]);

  useEffect(() => {
    if (!user?.blockedAt || !token || token.startsWith('demo:')) return;
    const timer = setInterval(() => {
      void refreshSession().catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshSession, token, user?.blockedAt]);

  const clearAuthError = useCallback(() => setAuthError(null), []);
  const dismissVkCommunityPrompt = useCallback(() => setVkCommunityPromptUrl(null), []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      sessionReady,
      authenticating,
      authError,
      vkCommunityPromptUrl,
      demoMode: demoEnabled,
      startPhoneAuth,
      startMaxPhoneAuth,
      checkMaxPhoneAuth,
      startTelegramPhoneAuth,
      checkTelegramPhoneAuth,
      startVkPhoneAuth,
      checkVkPhoneAuth,
      verifyPhoneAuth,
      continueDemo,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      refreshSession,
      signOut,
      dismissVkCommunityPrompt,
      clearAuthError,
    }),
    [
      authError,
      authenticating,
      checkMaxPhoneAuth,
      checkTelegramPhoneAuth,
      checkVkPhoneAuth,
      clearAuthError,
      continueDemo,
      dismissVkCommunityPrompt,
      loading,
      refreshSession,
      removeAvatar,
      sessionReady,
      signOut,
      startPhoneAuth,
      startMaxPhoneAuth,
      startTelegramPhoneAuth,
      startVkPhoneAuth,
      token,
      updateProfile,
      uploadAvatar,
      user,
      verifyPhoneAuth,
      vkCommunityPromptUrl,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = React.use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
