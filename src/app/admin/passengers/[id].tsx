import { useLocalSearchParams } from 'expo-router';

import { AdminAccountDetailScreen } from '@/screens/admin/admin-account-detail-screen';

export default function AdminPassengerDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AdminAccountDetailScreen id={id} kind="passenger" />;
}
