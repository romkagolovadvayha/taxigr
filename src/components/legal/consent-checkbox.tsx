import * as Haptics from 'expo-haptics';
import { Link, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppIcon } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type ConsentLink = {
  label: string;
  href: Href;
};

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  links: ConsentLink[];
  compactLinks?: boolean;
};

export function ConsentCheckbox({ checked, onChange, label, links, compactLinks = false }: Props) {
  const handleChange = () => {
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.selectionAsync();
    }
    onChange(!checked);
  };

  return (
    <View
      style={{
        gap: spacing.x3,
        padding: spacing.x4,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      <AnimatedPressable
        accessibilityRole="checkbox"
        aria-checked={checked}
        accessibilityLabel={label}
        accessibilityHint={checked ? 'Нажмите, чтобы снять согласие' : 'Нажмите, чтобы дать согласие'}
        hitSlop={4}
        onPress={handleChange}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.x3,
          opacity: pressed ? 0.84 : 1,
        })}
      >
        <View
          style={{
            width: compactLinks ? 28 : 24,
            height: compactLinks ? 28 : 24,
            marginTop: 1,
            borderRadius: compactLinks ? 8 : 7,
            borderCurve: 'continuous',
            borderWidth: checked ? 0 : 1.5,
            borderColor: checked ? colors.brand : colors.borderStrong,
            backgroundColor: checked ? colors.brand : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
      >
          {checked && (
            <Svg width={14} height={10} viewBox="0 0 14 10" aria-hidden>
              <Path
                d="M1.2 5.1L5.1 8.7L12.8 1.3"
                fill="none"
                stroke={colors.brandInk}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          )}
        </View>
        <Text selectable style={{ ...typography.body, color: colors.ink, flex: 1 }}>
          {label}
        </Text>
      </AnimatedPressable>
      {compactLinks ? (
        <View
          accessibilityLabel="Правовые документы"
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            columnGap: spacing.x1,
            rowGap: spacing.x1,
          }}
        >
          {links.map((link, index) => (
            <View key={link.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x1 }}>
              {index > 0 ? (
                <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
                  ·
                </Text>
              ) : null}
              <Link href={link.href} asChild>
                <AnimatedPressable
                  feedback="subtle"
                  accessibilityRole="link"
                  accessibilityLabel={`Открыть документ «${link.label}»`}
                  contentStyle={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: spacing.x1,
                    justifyContent: 'center',
                    opacity: pressed ? 0.68 : 1,
                  })}
                >
                  <Text
                    selectable
                    style={{
                      ...typography.caption,
                      color: colors.ink,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {link.label}
                  </Text>
                </AnimatedPressable>
              </Link>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: spacing.x2 }}>
          {links.map((link) => (
            <Link key={link.label} href={link.href} asChild>
              <AnimatedPressable
                accessibilityRole="link"
                contentStyle={({ pressed }) => ({
                  minHeight: 46,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.x3,
                  paddingHorizontal: spacing.x3,
                  paddingVertical: spacing.x2,
                  borderRadius: radius.sm,
                  borderCurve: 'continuous',
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <AppIcon name="document" size={19} color={colors.inkSecondary} />
                <Text selectable style={{ ...typography.caption, color: colors.ink, flex: 1 }}>
                  {link.label}
                </Text>
                <AppIcon name="chevron" size={17} color={colors.inkMuted} />
              </AnimatedPressable>
            </Link>
          ))}
        </View>
      )}
    </View>
  );
}
