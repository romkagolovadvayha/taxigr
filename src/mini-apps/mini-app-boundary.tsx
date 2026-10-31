import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { BrandGlyph } from '@/components/brand-mark';
import { AppButton } from '@/components/ui/app-button';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';
import { loadMiniAppBridge, requestMiniAppContact, type MiniAppBridge } from './bridge';
import { getMiniAppProvider, type MiniAppProvider } from './runtime';

export function MiniAppBoundary({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const { sessionReady, user, signInWithMiniApp } = useSession();
  const [provider, setProvider] = useState<MiniAppProvider | null>(null);
  const [status, setStatus] = useState<'loading' | 'phone' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingContact, setWaitingContact] = useState(false);
  const bridge = useRef<MiniAppBridge | null>(null);
  const contactRequest = useRef<string | null>(null);
  const active = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    active.current = true;
    const timer = setTimeout(() => setProvider(getMiniAppProvider()), 0);
    return () => { active.current = false; clearTimeout(timer); };
  }, []);

  const login = useCallback(async () => {
    if (!provider || lock.current) return;
    lock.current = true;
    setStatus('loading'); setError(null);
    try {
      bridge.current = await loadMiniAppBridge(provider);
      if (!active.current) return;
      const result = await signInWithMiniApp(provider, { initData: bridge.current.initData });
      if (active.current) setStatus(result === 'verified' ? 'ready' : 'phone');
    } catch (reason) {
      if (active.current) { setError(reason instanceof Error ? reason.message : 'Не удалось войти. Попробуйте ещё раз.'); setStatus('error'); }
    } finally { lock.current = false; }
  }, [provider, signInWithMiniApp]);

  useEffect(() => {
    if (!provider || !sessionReady) return;
    const timer = setTimeout(() => void login(), 0);
    return () => clearTimeout(timer);
  }, [provider, sessionReady, login]);
  useEffect(() => {
    if (!provider || typeof document === 'undefined') return;
    // The navigator is deliberately gated until messenger identity is verified.
    document.documentElement.removeAttribute('data-session-booting');
    document.documentElement.removeAttribute('data-theme-booting');
    document.getElementById('session-boot')?.remove();
  }, [provider]);

  const sharePhone = async () => {
    if (!provider || !bridge.current || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const initData = bridge.current.initData;
      if (provider === 'telegram' && !contactRequest.current) {
        const challenge = await apiRequest<{ requestId: string }>('/v1/auth/mini-app/telegram/contact', { method: 'POST', body: JSON.stringify({ initData }) });
        contactRequest.current = challenge.requestId;
        setWaitingContact(true);
        try { await requestMiniAppContact(provider, bridge.current); }
        catch (reason) { contactRequest.current = null; setWaitingContact(false); throw reason; }
      }
      const contact = provider === 'max' ? await requestMiniAppContact(provider, bridge.current) : null;
      // Only a short, user-triggered wait for the Telegram webhook; no idle polling.
      for (const delay of provider === 'telegram' ? [0, 500, 1000, 2000, 3000] : [0]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (!active.current) return;
        const result = await signInWithMiniApp(provider, { initData, ...(contact ? { contact } : {}),
          ...(contactRequest.current ? { contactRequestId: contactRequest.current } : {}) });
        if (result === 'verified') { setStatus('ready'); return; }
      }
      setError('Подтверждение ещё не пришло. Нажмите «Продолжить» через несколько секунд.');
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Не удалось подтвердить номер. Попробуйте ещё раз.');
    } finally { lock.current = false; if (active.current) setBusy(false); }
  };

  if (!provider || (status === 'ready' && user)) return children;
  return (
    <View style={{ flex: 1, minHeight: '100%', backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: spacing.x6 }}>
      <View style={{ width: '100%', maxWidth: 420, alignItems: 'center', gap: spacing.x5 }}>
        <BrandGlyph size={72} />
        <Text style={{ ...typography.pageTitle, color: colors.ink, textAlign: 'center' }}>Такси Грахово</Text>
        <Text style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
          {status === 'loading' ? 'Открываем заказ такси…' : status === 'phone' ? 'Поделитесь номером телефона, чтобы водитель мог связаться с вами.' : 'Закажите такси прямо здесь — адреса, поездка и связь с водителем в одном окне.'}
        </Text>
        {error ? <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
        {status === 'loading' ? <ActivityIndicator color={colors.ink} /> : status === 'phone' ?
          <AppButton loading={busy} onPress={() => void sharePhone()}>{waitingContact ? 'Продолжить' : 'Поделиться номером'}</AppButton> :
          <AppButton onPress={() => void login()}>Войти через {provider === 'max' ? 'MAX' : 'Telegram'}</AppButton>}
        {status === 'phone' && waitingContact && !busy ? <AppButton variant="quiet" onPress={() => { contactRequest.current = null; setWaitingContact(false); void sharePhone(); }}>Поделиться номером ещё раз</AppButton> : null}
      </View>
    </View>
  );
}
