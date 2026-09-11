import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { router, usePathname, type ErrorBoundaryProps, type Href } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { FontDisplay, useFonts } from 'expo-font';
import { useReducedMotion } from 'react-native-reanimated';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/location/driver-background-location';

import { useSession } from '@/auth/session-provider';
import { BrandGlyph } from '@/components/brand-mark';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppUpdatePromptHost } from '@/components/updates/app-update-prompt';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';
import { AppProviders } from '@/providers/app-providers';
import { AppHead } from '@/seo/app-head';
import { BlockedAccountScreen } from '@/screens/blocked-account-screen';
import { useThemeColors, AppThemeProvider, useAppTheme } from '@/theme/theme-provider';
import { brandIdentity, radius, spacing, typography } from '@/theme/tokens';

if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useThemeColors();
  useEffect(() => {
    if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => undefined);
    void reportCriticalClientError(error, {
      source: 'react-error-boundary',
      fatal: true,
    });
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.canvas,
        padding: spacing.x6,
        gap: spacing.x4,
      }}
    >
      <BrandGlyph size={72} color={colors.ink} pinColor={colors.brand} />
      <Text style={{ ...typography.pageTitle, color: colors.ink, textAlign: 'center' }}>
        Произошла ошибка
      </Text>
      <Text style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
        Администраторы уже получили техническую информацию. Попробуйте открыть экран ещё раз.
      </Text>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={{
          borderRadius: 16,
          backgroundColor: colors.brand,
          paddingHorizontal: spacing.x6,
          paddingVertical: spacing.x4,
        }}
      >
        <Text style={{ ...typography.bodyStrong, color: colors.brandInk }}>Повторить</Text>
      </AnimatedPressable>
    </View>
  );
}

function RootNavigator() {
  const colors = useThemeColors();
  const { user, loading, sessionReady } = useSession();
  const pathname = usePathname();
  const { dark, ready: themeReady } = useAppTheme();
  const [fontsLoaded, fontError] = useFonts({
    Manrope: { uri: require('../../assets/fonts/Manrope-Medium.ttf'), display: FontDisplay.SWAP },
    'Manrope-SemiBold': { uri: require('../../assets/fonts/Manrope-SemiBold.ttf'), display: FontDisplay.SWAP },
  });
  // Native builds embed this font. A web font request must not hold the app
  // behind the splash on a cold or slow connection; text uses a fallback.
  const fontsReady = Platform.OS === 'web' || fontsLoaded || !!fontError;
  const reducedMotion = useReducedMotion();
  const navigationTheme = {
    ...DefaultTheme,
    dark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.ink,
      background: colors.canvas,
      card: colors.surface,
      text: colors.ink,
      border: colors.border,
      notification: colors.brand,
    },
  };

  useEffect(() => {
    // Render our loading view while restoring the session. Keeping Android's
    // splash visible until network/storage completes hides the first frame.
    if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!sessionReady || !themeReady || !fontsReady) return;
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-session-booting');
      document.documentElement.removeAttribute('data-theme-booting');
      document.getElementById('session-boot')?.remove();
    }
  }, [sessionReady, themeReady, fontsReady]);

  useEffect(() => {
    if (
      !sessionReady ||
      !user ||
      user.profileComplete ||
      pathname === '/profile-setup' ||
      pathname === '/vk'
    ) return;
    router.replace('/profile-setup' as Href);
  }, [pathname, sessionReady, user]);

  if (loading || !themeReady || !fontsReady) {
    return (
      <View
        accessibilityLabel="Загрузка приложения"
        accessibilityRole="progressbar"
        style={{
          flex: 1,
          minHeight: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brandIdentity.background,
          gap: spacing.x4,
          padding: spacing.x6,
        }}
      >
        <BrandGlyph size={76} />
        <Text selectable style={{ ...typography.pageTitle, color: brandIdentity.ink, textAlign: 'center' }}>
          Такси Грахово
        </Text>
        <ActivityIndicator color={brandIdentity.ink} size="small" />
        <Text selectable style={{ ...typography.caption, color: '#53451E', textAlign: 'center' }}>
          Загружаем приложение…
        </Text>
      </View>
    );
  }

  if (user?.blockedAt && pathname !== '/vk') {
    return (
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <BlockedAccountScreen />
      </ThemeProvider>
    );
  }

  const canDrive = user?.roles.includes('driver') ?? false;
  const isAdmin = user?.roles.includes('admin') ?? false;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        key={user?.id ?? 'signed-out'}
        screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'slide_from_right', contentStyle: { backgroundColor: colors.canvas } }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="account-deletion" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="legal" />
        <Stack.Screen name="passenger-rules" />
        <Stack.Screen name="personal-data-consent" />
        <Stack.Screen name="driver-terms" />
        <Stack.Screen name="driver-data-consent" />
        <Stack.Screen name="safety" />
        <Stack.Screen name="vk" />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && !user.profileComplete}>
          <Stack.Screen name="profile-setup" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && user.profileComplete}>
          <Stack.Screen
            name="address-search"
            options={{
              // Android form sheets intercept the embedded map's pan/pinch gestures.
              presentation: 'fullScreenModal',
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="stops"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.58, 1],
              sheetInitialDetentIndex: 0,
              sheetGrabberVisible: true,
              sheetCornerRadius: radius.sheet,
            }}
          />
          <Stack.Screen
            name="order-confirmation"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.72, 1],
              sheetInitialDetentIndex: 'last',
              sheetGrabberVisible: true,
              sheetCornerRadius: radius.sheet,
            }}
          />
          <Stack.Screen name="orders" />
          <Stack.Screen name="orders/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="personal-data" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="driver-application" />
        </Stack.Protected>
        <Stack.Protected guard={canDrive}>
          <Stack.Screen name="driver" />
        </Stack.Protected>
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
      <AppUpdatePromptHost />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const pathname = usePathname();

  return (
    <>
      <AppHead pathname={pathname} />
      <AppThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppProviders>
            <RootNavigator />
          </AppProviders>
        </GestureHandlerRootView>
      </AppThemeProvider>
    </>
  );
}
