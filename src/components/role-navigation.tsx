import { Link, usePathname } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { isNavItemActive } from '@/domain/role-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

export type NavItem = {
  href: string;
  label: string;
  icon: AppIconName;
};

type Props = {
  items: NavItem[];
  title: string;
};

export function RoleNavigation({ items, title }: Props) {
  const colors = useThemeColors();
  const pathname = usePathname();
  const { isDesktop } = useResponsiveLayout();
  const insets = useSafeAreaInsets();

  if (!isDesktop) {
    return (
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingTop: spacing.x1,
          paddingBottom: Math.max(insets.bottom, spacing.x2),
          paddingHorizontal: Math.max(insets.left, insets.right, spacing.x2),
        }}
      >
        <ScrollView
          accessibilityRole="tablist"
          horizontal
          scrollEnabled={items.length > 5}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'space-between',
            gap: spacing.x1,
          }}
        >
          {items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href as never} replace asChild>
                <AnimatedPressable
                  feedback="subtle"
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  aria-selected={active}
                  contentStyle={({ pressed }) => ({
                    minWidth: items.length > 5 ? 76 : 0,
                    flexBasis: items.length > 5 ? 'auto' : 0,
                    flexGrow: items.length > 5 ? 0 : 1,
                    flexShrink: 1,
                    minHeight: 48,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    opacity: pressed ? 0.62 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 28,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.transparent,
                    }}
                  >
                    <AppIcon
                      name={item.icon}
                      size={20}
                      color={active ? colors.infoText : colors.inkSecondary}
                      strokeWidth={active ? 2 : 1.6}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={{
                      ...typography.micro,
                      color: active ? colors.infoText : colors.inkSecondary,
                      fontSize: 10,
                      lineHeight: 12,
                      textAlign: 'center',
                    }}
                  >
                    {item.label}
                  </Text>
                </AnimatedPressable>
              </Link>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={{
        width: 248,
        backgroundColor: colors.canvas,
        borderRightWidth: 1,
        borderColor: colors.border,
        padding: spacing.x5,
        gap: spacing.x8,
      }}
    >
      <View style={{ gap: spacing.x2 }}>
        <BrandMark size={44} />
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{title}</Text>
      </View>
      <View style={{ gap: spacing.x2 }}>
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href as never} replace asChild>
              <AnimatedPressable
                feedback="subtle"
                accessibilityRole="link"
                accessibilityLabel={active ? `${item.label}, текущий раздел` : item.label}
                contentStyle={({ pressed }) => ({
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.x3,
                  paddingHorizontal: spacing.x3,
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.brandSoft : colors.transparent,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <AppIcon name={item.icon} color={active ? colors.infoText : colors.inkSecondary} />
                <Text style={{ ...typography.bodyStrong, color: active ? colors.infoText : colors.inkSecondary }}>{item.label}</Text>
              </AnimatedPressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}
