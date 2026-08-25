import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/ui/app-icon';
import { useSession } from '@/auth/session-provider';
import { colors, layout, radius, spacing, typography } from '@/theme/tokens';

export function BlockedAccountScreen() {
  const { user } = useSession();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        flex: 1,
        minHeight: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.danger,
        paddingTop: Math.max(insets.top, spacing.x6),
        paddingRight: Math.max(insets.right, spacing.x6),
        paddingBottom: Math.max(insets.bottom, spacing.x6),
        paddingLeft: Math.max(insets.left, spacing.x6),
      }}
    >
      <View style={{ width: '100%', maxWidth: layout.modalWidth, alignItems: 'center', gap: spacing.x6 }}>
        <View
          accessibilityElementsHidden
          style={{
            width: spacing.x12 * 2,
            height: spacing.x12 * 2,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.dangerInk,
          }}
        >
          <AppIcon name="ban" size={spacing.x12} color={colors.danger} />
        </View>
        <View style={{ alignItems: 'center', gap: spacing.x3 }}>
          <Text
            selectable
            style={{ ...typography.display, color: colors.dangerInk, textAlign: 'center' }}
          >
            Вы заблокированы
          </Text>
          <Text
            selectable
            style={{ ...typography.body, color: colors.dangerInk, textAlign: 'center' }}
          >
            Доступ к приложению закрыт администратором.
          </Text>
        </View>
        <View
          style={{
            width: '100%',
            padding: spacing.x5,
            borderRadius: radius.card,
            borderCurve: 'continuous',
            backgroundColor: colors.dangerInk,
            gap: spacing.x2,
          }}
        >
          <Text style={{ ...typography.micro, color: colors.danger }}>ПРИЧИНА БЛОКИРОВКИ</Text>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.dangerPanelInk }}>
            {user?.blockReason ?? 'Причина не указана'}
          </Text>
        </View>
        <Text selectable style={{ ...typography.caption, color: colors.dangerInk, textAlign: 'center' }}>
          Экран обновится автоматически, если администратор вернёт доступ.
        </Text>
      </View>
    </View>
  );
}
