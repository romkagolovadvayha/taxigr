import { useSession } from '@/auth/session-provider';
import { OrderScreen } from '@/screens/passenger/order-screen';
import { PublicLandingScreen } from '@/screens/public-landing-screen';
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { getEmbeddedAppProvider } from '@/mini-apps/runtime';

export default function HomeRoute() {
  const { user, sessionReady } = useSession();

  if (user) return <OrderScreen />;
  if (Platform.OS !== 'web') return <Redirect href="/sign-in" />;
  if (sessionReady && getEmbeddedAppProvider() === 'vk') return <Redirect href="/vk" />;

  return <PublicLandingScreen />;
}
