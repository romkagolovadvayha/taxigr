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

  if (compactLinks) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.x2,
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
            width: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: spacing.x2,
            opacity: pressed ? 0.84 : 1,
          })}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              borderCurve: 'continuous',
              borderWidth: checked ? 0 : 1.5,
              borderColor: checked ? colors.brand : colors.borderStrong,
              backgroundColor: checked ? colors.brand : colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
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
        </AnimatedPressable>
        <Text
          selectable
          style={{
            ...typography.caption,
            color: colors.ink,
            flex: 1,
            paddingTop: spacing.x2,
          }}
        >
          {label}{' '}
          {links.map((link, index) => (
            <Text key={link.label}>
              {index > 0 ? ', ' : null}
              <Link
                href={link.href}
                accessibilityRole="link"
                accessibilityLabel={`Открыть документ «${link.label}»`}
                style={{
                  ...typography.caption,
                  color: colors.ink,
                  fontWeight: '700',
                  textDecorationLine: 'underline',
                }}
              >
                {link.label}
              </Link>
            </Text>
          ))}
        </Text>
      </View>
    );
  }

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
    </View>
  );
}
