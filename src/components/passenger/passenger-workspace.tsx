import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoleNavigation, type NavItem } from '@/components/role-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useThemeColors } from '@/theme/theme-provider';

const items: NavItem[] = [
  { href: '/', label: 'Поездка', icon: 'location' },
  { href: '/orders', label: 'История', icon: 'orders' },
  { href: '/profile', label: 'Профиль', icon: 'profile' },
];

export function PassengerWorkspace({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const { isDesktop } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: colors.surface,
      paddingBottom: isDesktop ? 0 : insets.bottom }}>
      {isDesktop && <RoleNavigation items={items} title="Такси рядом · Грахово" />}
      <View style={{ flex: 1, minHeight: 0, minWidth: 0 }}>{children}</View>
    </View>
  );
}
