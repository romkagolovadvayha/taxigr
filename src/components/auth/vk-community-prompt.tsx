import { useState } from 'react';
import { Text, View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { VkLogo } from '@/components/auth/vk-logo';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { colors, spacing, typography } from '@/theme/tokens';
import {
  closePreparedExternalAuthWindow,
  openExternalAuthUrl,
  prepareExternalAuthWindow,
} from '@/utils/open-external-auth';

export function VkCommunityPromptHost() {
  const { user, vkCommunityPromptUrl, dismissVkCommunityPrompt } = useSession();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = Boolean(user && vkCommunityPromptUrl);

  const openCommunity = async () => {
    if (!vkCommunityPromptUrl || opening) return;
    const externalWindow = prepareExternalAuthWindow();
    setOpening(true);
    setError(null);
    try {
      await openExternalAuthUrl(vkCommunityPromptUrl, externalWindow);
      dismissVkCommunityPrompt();
    } catch {
      closePreparedExternalAuthWindow(externalWindow);
      setError('Не удалось открыть VK. Попробуйте ещё раз.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      title="Получать статусы поездок в VK?"
      description="Вход уже выполнен. Разрешите сообщения сообщества, чтобы бот мог присылать статусы заказа и важные уведомления."
      onClose={dismissVkCommunityPrompt}
    >
      <View style={{ gap: spacing.x3 }}>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
          В открывшемся чате нажмите «Начать» или разрешите сообщения сообщества. Это можно сделать позже.
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>
            {error}
          </Text>
        )}
        <AppButton
          loading={opening}
          foregroundColor="#FFFFFF"
          icon={<VkLogo />}
          onPress={() => void openCommunity()}
          style={{ backgroundColor: '#0077FF' }}
        >
          Разрешить сообщения в VK
        </AppButton>
        <AppButton variant="quiet" onPress={dismissVkCommunityPrompt}>
          Не сейчас
        </AppButton>
      </View>
    </AppModal>
  );
}
