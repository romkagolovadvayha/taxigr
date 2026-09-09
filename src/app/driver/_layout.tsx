import { Slot } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoleNavigation, type NavItem } from '@/components/role-navigation';
import { DriverRatingPrompt } from '@/components/ratings/driver-rating-prompt';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

import { useThemeColors } from '@/theme/theme-provider';

const items: NavItem[] = [
  { href: '/driver', label: 'Заказы', icon: 'car' },
  { href: '/driver/trips', label: 'Поездки', icon: 'orders' },
  { href: '/driver/earnings', label: 'Доход', icon: 'earnings' },
  { href: '/driver/support', label: 'Помощь', icon: 'shield' },
  { href: '/driver/profile', label: 'Профиль', icon: 'profile' },
];

export default function DriverLayout() {
  const colors = useThemeColors();
  const { isDesktop } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right,
      flexDirection: isDesktop ? 'row' : 'column', backgroundColor: colors.canvas }}>
      {isDesktop && <RoleNavigation items={items} title="Кабинет водителя" />}
      <View style={{ flex: 1 }}><Slot /></View>
      {!isDesktop && <RoleNavigation items={items} title="Кабинет водителя" />}
      <DriverRatingPrompt />
    </View>
  );
}
