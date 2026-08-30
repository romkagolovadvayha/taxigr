import { useLocalSearchParams } from 'expo-router';

import { AdminOrderDetailScreen } from '@/screens/admin/admin-order-detail-screen';

export default function AdminOrderDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AdminOrderDetailScreen id={id} />;
}
