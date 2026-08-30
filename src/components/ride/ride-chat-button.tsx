import { router } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
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
  return (
    <AppButton
      variant="secondary"
      compact={compact}
      fullWidth={fullWidth}
      style={style}
      accessibilityLabel={accessibilityLabel}
      icon={<AppIcon name="chat" size={compact ? 20 : 22} color={colors.ink} />}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: orderId } } as never)}
    >
      {label}
    </AppButton>
  );
}
