import { Text, TextInput, View } from 'react-native';

import {
  formatRussianNationalPhone,
  russianNationalPhoneDigits,
} from '@/utils/phone';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type Props = {
  value: string;
  onChange: (nationalDigits: string) => void;
  editable?: boolean;
  onSubmit?: () => void;
  compact?: boolean;
};

export function RussianPhoneInput({
  value,
  onChange,
  editable = true,
  onSubmit,
  compact = false,
}: Props) {
  const colors = useThemeColors();
  const digits = russianNationalPhoneDigits(value);
  const hasInvalidMobilePrefix = digits.length > 0 && !digits.startsWith('9');

  return (
    <View style={{ gap: spacing.x2 }}>
      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
        Номер телефона
      </Text>
      <View
        style={{
          minHeight: compact ? 52 : 60,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: colors.surfaceSecondary,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            alignSelf: 'stretch',
            minWidth: 62,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceSecondary,
            borderRightWidth: 1,
            borderRightColor: colors.border,
          }}
        >
          <Text
            selectable
            accessibilityLabel="Код страны плюс семь"
            style={{
              fontSize: compact ? 20 : 22,
              lineHeight: 30,
              fontWeight: '700',
              color: colors.ink,
              fontVariant: ['tabular-nums'],
            }}
          >
            +7
          </Text>
        </View>
        <TextInput
          value={formatRussianNationalPhone(digits)}
          onChangeText={(nextValue) => onChange(russianNationalPhoneDigits(nextValue))}
          onSubmitEditing={onSubmit}
          editable={editable}
          keyboardType="phone-pad"
          inputMode="tel"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoCorrect={false}
          underlineColorAndroid="transparent"
          returnKeyType="done"
          accessibilityLabel="Номер телефона, код страны плюс семь уже указан"
          accessibilityHint="Введите десять цифр российского мобильного номера"
          placeholder="(900) 000-00-00"
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.ink}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: compact ? 50 : 58,
            paddingHorizontal: spacing.x4,
            paddingVertical: 0,
            fontFamily: 'Manrope',
            fontSize: compact ? 19 : 22,
            lineHeight: 30,
            fontWeight: '600',
            letterSpacing: 0.2,
            color: colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        />
      </View>
      {hasInvalidMobilePrefix && (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ ...typography.caption, color: colors.danger }}
        >
          Мобильный номер после +7 должен начинаться с 9
        </Text>
      )}
    </View>
  );
}
