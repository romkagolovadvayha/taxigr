import { Slot } from 'expo-router';
import { View } from 'react-native';

import { RoleNavigation, type NavItem } from '@/components/role-navigation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors } from '@/theme/tokens';

const items: NavItem[] = [
  { href: '/admin', label: 'Сводка', icon: 'earnings' },
  { href: '/admin/applications', label: 'Заявки', icon: 'document' },
  { href: '/admin/passengers', label: 'Пассажиры', icon: 'users' },
  { href: '/admin/drivers', label: 'Водители', icon: 'car' },
  { href: '/admin/orders', label: 'Заказы', icon: 'orders' },
  { href: '/admin/places', label: 'Места', icon: 'location' },
  { href: '/admin/settings', label: 'Настройки', icon: 'settings' },
];

export default function AdminLayout() {
  const { isDesktop } = useResponsiveLayout();
  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: colors.canvas }}>
      {isDesktop && <RoleNavigation items={items} title="Суперадмин" />}
      <View style={{ flex: 1 }}><Slot /></View>
      {!isDesktop && <RoleNavigation items={items} title="Суперадмин" />}
    </View>
  );
}
