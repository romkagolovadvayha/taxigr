import { useSession } from '@/auth/session-provider';
import { OrderScreen } from '@/screens/passenger/order-screen';
import { PublicLandingScreen } from '@/screens/public-landing-screen';
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

export default function HomeRoute() {
  const { user } = useSession();

  if (user) return <OrderScreen />;
  if (Platform.OS !== 'web') return <Redirect href="/sign-in" />;

  return <PublicLandingScreen />;
}
