import { router } from 'expo-router';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { useRide } from '@/state/ride-provider';
import { colors } from '@/theme/tokens';

type Props = {
  orderId: string;
  label: string;
  accessibilityLabel?: string;
  compact?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RideChatButton({
  orderId,
  label,
  accessibilityLabel = label,
  compact = false,
  fullWidth = true,
  style,
}: Props) {
  const { chatUnreadCounts } = useRide();
  const unreadCount = chatUnreadCounts[orderId] ?? 0;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const resolvedAccessibilityLabel = unreadCount > 0
    ? `${accessibilityLabel}. Непрочитанных сообщений: ${unreadCount}`
    : accessibilityLabel;

  return (
    <AppButton
      variant="secondary"
      compact={compact}
      fullWidth={fullWidth}
      style={style}
      accessibilityLabel={resolvedAccessibilityLabel}
      icon={<AppIcon name="chat" size={compact ? 20 : 22} color={colors.ink} />}
      badge={unreadCount > 0 ? (
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: -7,
            right: -7,
            minWidth: 24,
            height: 24,
            paddingHorizontal: unreadCount > 99 ? 5 : 0,
            borderRadius: 12,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.danger,
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        >
          <Text
            style={{
              color: colors.dangerPanelInk,
              fontSize: 11,
              lineHeight: 14,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {unreadLabel}
          </Text>
        </View>
      ) : undefined}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: orderId } } as never)}
    >
      {label}
    </AppButton>
  );
}
