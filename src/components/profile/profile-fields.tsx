import { Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export type ProfileGender = 'male' | 'female';

export function ProfileFields({
  name,
  gender,
  onNameChange,
  onGenderChange,
  editable = true,
}: {
  name: string;
  gender: ProfileGender | null;
  onNameChange: (value: string) => void;
  onGenderChange: (value: ProfileGender) => void;
  editable?: boolean;
}) {
  return (
    <View style={{ gap: spacing.x4 }}>
      <View style={{ gap: spacing.x2 }}>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Имя и фамилия
        </Text>
        <TextInput
          value={name}
          onChangeText={onNameChange}
          editable={editable}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          returnKeyType="done"
          accessibilityLabel="Имя и фамилия"
          placeholder="Иван Иванов"
          placeholderTextColor={colors.inkMuted}
          maxLength={160}
          style={{
            ...typography.body,
            minHeight: 58,
            paddingHorizontal: spacing.x4,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.ink,
          }}
        />
      </View>

      <View style={{ gap: spacing.x2 }}>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Пол
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', gap: spacing.x2 }}
        >
          {([
            ['male', 'Мужской'],
            ['female', 'Женский'],
          ] as const).map(([value, label]) => {
            const selected = gender === value;
            return (
              <AnimatedPressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={label}
                aria-checked={selected}
                aria-disabled={!editable}
                disabled={!editable}
                onPress={() => onGenderChange(value)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.lg,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.brandPressed : colors.borderStrong,
                  backgroundColor: selected ? colors.brandSoft : colors.surface,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
