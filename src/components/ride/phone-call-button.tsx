import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { colors, spacing, typography } from '@/theme/tokens';
import { openPhoneCall } from '@/utils/open-phone-call';

type Props = {
  phone: string;
  label: string;
};

export function PhoneCallButton({ phone, label }: Props) {
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
    <View style={{ gap: spacing.x2 }}>
      <AppButton
        variant="call"
        loading={calling}
        accessibilityLabel={label}
        accessibilityHint={`Откроется приложение телефона для номера ${phone}`}
        icon={<AppIcon name="phone" size={spacing.x6} color={colors.callInk} />}
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
