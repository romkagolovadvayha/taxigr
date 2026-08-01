import { Slot } from 'expo-router';
import { View } from 'react-native';

import { RoleNavigation, type NavItem } from '@/components/role-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors } from '@/theme/tokens';

const items: NavItem[] = [
  { href: '/driver', label: 'Заказы', icon: 'car' },
  { href: '/driver/trips', label: 'Поездки', icon: 'orders' },
  { href: '/driver/earnings', label: 'Доход', icon: 'earnings' },
  { href: '/driver/support', label: 'Помощь', icon: 'shield' },
  { href: '/driver/profile', label: 'Профиль', icon: 'profile' },
];

export default function DriverLayout() {
  const { isDesktop } = useResponsiveLayout();
  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: colors.canvas }}>
      {isDesktop && <RoleNavigation items={items} title="Кабинет водителя" />}
      <View style={{ flex: 1 }}><Slot /></View>
      {!isDesktop && <RoleNavigation items={items} title="Кабинет водителя" />}
    </View>
  );
}
