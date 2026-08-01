import { useSession } from '@/auth/session-provider';
import { OrderScreen } from '@/screens/passenger/order-screen';
import { PublicLandingScreen } from '@/screens/public-landing-screen';

export default function HomeRoute() {
  const { user } = useSession();
  return user ? <OrderScreen /> : <PublicLandingScreen />;
}
