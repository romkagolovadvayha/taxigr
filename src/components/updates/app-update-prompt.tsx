import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { storeNames } from '@/domain/app-updates';
import { useRideFeedback } from '@/feedback/ride-feedback-provider';
import { useRide } from '@/state/ride-provider';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { useAppUpdate } from '@/updates/app-update-provider';

export function AppUpdatePromptHost() {
  const colors = useThemeColors();
  const pathname = usePathname();
  const { user, sessionReady, vkCommunityPromptUrl } = useSession();
  const { bootstrapReady, currentRide, driverRide, nextDriverRide, driverOffer, driverRatingRide, busy } = useRide();
  const { available, promptVisible, canPrompt, opening, error, controller } = useAppUpdate();
  const { announceAppUpdate } = useRideFeedback();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const hasRide = [currentRide, driverRide, nextDriverRide, driverOffer].some(
    (ride) => ride && !['completed', 'cancelled'].includes(ride.status),
  );
  const eligible = foreground && sessionReady && bootstrapReady && !!user?.profileComplete &&
    !user.blockedAt && !vkCommunityPromptUrl && !hasRide && !driverRatingRide && !busy &&
    ['/', '/profile', '/driver', '/driver/profile'].includes(pathname);
  const eligibleRef = useRef(eligible);

  useEffect(() => { eligibleRef.current = eligible; }, [eligible]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => { eligibleRef.current = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (eligible && canPrompt) void controller.presentPrompt(() => eligibleRef.current);
    // An incoming order takes priority even if the popup is already on screen.
    if (!eligible && promptVisible) controller.dismissPrompt();
  }, [eligible, canPrompt, available?.id, promptVisible, controller]);

  useEffect(() => {
    if (!eligible || !promptVisible || !available?.id) return;
    let stopAnnouncement: (() => void) | undefined;
    // Defer until the prompt is rendered; Strict Mode cleanup cancels an unstarted announcement.
    const timer = setTimeout(() => {
      stopAnnouncement = announceAppUpdate(available.id);
    }, 0);
    return () => {
      clearTimeout(timer);
      stopAnnouncement?.();
    };
  }, [announceAppUpdate, available?.id, eligible, promptVisible]);

  if (!available) return null;
  return (
    <AppModal visible={promptVisible} title="Такси Грахово стало лучше" onClose={controller.dismissPrompt}>
      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: spacing.x4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <View style={{ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <AppIcon name="download" size={28} color={colors.brandInk} />
          </View>
          <View style={{ flex: 1, gap: spacing.x1 }}>
            <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Новая версия {available.version}</Text>
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Доступна в {storeNames[available.store]}</Text>
          </View>
        </View>
        <Text style={{ ...typography.body, color: colors.inkSecondary }}>
          {available.notes || 'Обновите приложение, чтобы пользоваться последними улучшениями.'}
        </Text>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
          Можно обновить позже — кнопка останется в профиле.
        </Text>
      </ScrollView>
      {!!error && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.dangerText }}>{error}</Text>}
      <AppButton loading={opening} onPress={() => void controller.openStore()}>Обновить в {storeNames[available.store]}</AppButton>
      <AppButton variant="quiet" onPress={controller.dismissPrompt}>Позже</AppButton>
    </AppModal>
  );
}
