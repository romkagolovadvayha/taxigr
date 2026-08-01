import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { router, usePathname, type ErrorBoundaryProps, type Href } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSession } from '@/auth/session-provider';
import { BrandGlyph } from '@/components/brand-mark';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';
import { AppProviders } from '@/providers/app-providers';
import { AppHead } from '@/seo/app-head';
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider';
import { colors, spacing, typography } from '@/theme/tokens';

if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void reportCriticalClientError(error, {
      source: 'react-error-boundary',
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
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
      <Pressable
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
      </Pressable>
    </View>
  );
}

function RootNavigator() {
  const { user, loading, sessionReady } = useSession();
  const pathname = usePathname();
  const { colorScheme, dark, ready: themeReady } = useAppTheme();
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
    if (!sessionReady || !themeReady) return;
    if (Platform.OS !== 'web') void SplashScreen.hideAsync();
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-session-booting');
      document.documentElement.removeAttribute('data-theme-booting');
      document.getElementById('session-boot')?.remove();
    }
  }, [sessionReady, themeReady]);

  useEffect(() => {
    if (!sessionReady || !user || user.profileComplete || pathname === '/profile-setup') return;
    router.replace('/profile-setup' as Href);
  }, [pathname, sessionReady, user]);

  if (loading || !themeReady) {
    return (
      <View
        accessibilityLabel="Загрузка приложения"
        accessibilityRole="progressbar"
        style={{
          flex: 1,
          minHeight: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.brand,
          gap: spacing.x4,
          padding: spacing.x6,
        }}
      >
        <BrandGlyph size={76} color={colors.brandInk} pinColor={colors.brand} />
        <Text selectable style={{ ...typography.pageTitle, color: colors.brandInk, textAlign: 'center' }}>
          Такси Грахово
        </Text>
        <ActivityIndicator color={colors.brandInk} size="small" />
        <Text selectable style={{ ...typography.caption, color: colors.brandInkSecondary, textAlign: 'center' }}>
          Загружаем приложение…
        </Text>
      </View>
    );
  }

  const canDrive = user?.roles.includes('driver') ?? false;
  const isAdmin = user?.roles.includes('admin') ?? false;

  return (
    <ThemeProvider key={colorScheme} value={navigationTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        key={colorScheme}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}
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
              presentation: 'formSheet',
              sheetAllowedDetents: [0.78, 1],
              sheetInitialDetentIndex: 'last',
              sheetGrabberVisible: true,
              sheetCornerRadius: 30,
            }}
          />
          <Stack.Screen
            name="order-confirmation"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.72, 1],
              sheetInitialDetentIndex: 'last',
              sheetGrabberVisible: true,
              sheetCornerRadius: 30,
            }}
          />
          <Stack.Screen name="orders" />
          <Stack.Screen name="orders/[id]" />
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
