import { OrderScreen } from '@/screens/passenger/order-screen';
import { useSession } from '@/auth/session-provider';

export default function MaxMiniApp() {
  const { user } = useSession();
  return user ? <OrderScreen /> : null;
}
