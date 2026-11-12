import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

export function DeleteAccountPanel() {
  const { token, signOut, demoMode } = useSession();
  const colors = useThemeColors();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!demoMode) await apiRequest('/v1/me', {
        method: 'DELETE', token, body: JSON.stringify({ confirmation: 'DELETE_ACCOUNT' }),
      });
      setConfirming(false);
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить аккаунт. Попробуйте ещё раз.');
    } finally { setBusy(false); }
  };
  return <View style={{ gap: spacing.x4 }}>
    <AppButton variant="quiet" onPress={() => router.back()}>Назад</AppButton>
    <Text accessibilityRole="header" style={{ ...typography.pageTitle, color: colors.ink }}>Удаление аккаунта</Text>
    <Text style={{ ...typography.body, color: colors.inkSecondary }}>
      Профиль, фотография, привязки мессенджеров и данные входа будут удалены. Восстановить аккаунт не получится.
      Перед удалением завершите или отмените все заказы.
    </Text>
    <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
      История поездок и расчётов, согласия и документы водителя сохраняются в сроки, указанные в политике конфиденциальности.
    </Text>
    <AppButton variant="danger" onPress={() => { setError(null); setConfirming(true); }}>Удалить мой аккаунт</AppButton>
    <AppModal visible={confirming} title="Удалить аккаунт навсегда?" onClose={() => { if (!busy) setConfirming(false); }}>
      <Text style={{ ...typography.body, color: colors.inkSecondary }}>Вы выйдете из приложения на всех устройствах. Это действие нельзя отменить.</Text>
      {error && <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.dangerText }}>{error}</Text>}
      <AppButton variant="danger" loading={busy} disabled={busy} onPress={() => void remove()}>Да, удалить аккаунт</AppButton>
      <AppButton variant="secondary" disabled={busy} onPress={() => setConfirming(false)}>Оставить аккаунт</AppButton>
    </AppModal>
  </View>;
}
