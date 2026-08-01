import { Link, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { isNavItemActive } from '@/domain/role-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
        <View
          accessibilityRole="tablist"
          style={{
            width: '100%',
            alignSelf: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: spacing.x1,
          }}
        >
          {items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href as never} asChild>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => ({
                    minWidth: 0,
                    flexBasis: 0,
                    flexGrow: 1,
                    flexShrink: 1,
                    minHeight: 56,
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
                      backgroundColor: active ? colors.brandSoft : colors.transparent,
                    }}
                  >
                    <AppIcon
                      name={item.icon}
                      size={20}
                      color={active ? colors.ink : colors.inkSecondary}
                      strokeWidth={active ? 2.35 : 2}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={{
                      ...typography.micro,
                      color: active ? colors.ink : colors.inkSecondary,
                      fontSize: 10,
                      lineHeight: 12,
                      textAlign: 'center',
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        width: 248,
        backgroundColor: colors.surface,
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
            <Link key={item.href} href={item.href as never} asChild>
              <Pressable
                style={({ pressed }) => ({
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.x3,
                  paddingHorizontal: spacing.x3,
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.canvas : colors.transparent,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <AppIcon name={item.icon} color={active ? colors.ink : colors.inkSecondary} />
                <Text style={{ ...typography.bodyStrong, color: active ? colors.ink : colors.inkSecondary }}>{item.label}</Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}
