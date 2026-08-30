import { useState } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { colors, spacing, typography } from '@/theme/tokens';
import { openPhoneCall } from '@/utils/open-phone-call';

type Props = {
  phone: string;
  label: string;
  accessibilityLabel?: string;
  variant?: 'call' | 'secondary';
  compact?: boolean;
  fullWidth?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
};

export function PhoneCallButton({
  phone,
  label,
  accessibilityLabel = label,
  variant = 'call',
  compact = false,
  fullWidth = true,
  containerStyle,
  buttonStyle,
}: Props) {
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async () => {
    setCalling(true);
    setError(null);
    try {
      await openPhoneCall(phone);
    } catch {
      setError('Не удалось открыть приложение для звонка.');
    } finally {
      setCalling(false);
    }
  };

  return (
    <View style={[{ gap: spacing.x2 }, containerStyle]}>
      <AppButton
        variant={variant}
        compact={compact}
        fullWidth={fullWidth}
        style={buttonStyle}
        loading={calling}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Откроется приложение телефона для номера ${phone}`}
        icon={
          <AppIcon
            name="phone"
            size={compact ? 20 : 22}
            color={variant === 'call' ? colors.callInk : colors.ink}
          />
        }
        onPress={() => void call()}
      >
        {label}
      </AppButton>
      {!!error && (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ ...typography.caption, color: colors.danger }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
