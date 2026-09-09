import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { readStoredColorScheme, writeStoredColorScheme } from '@/theme/theme-storage';
import {
  darkColors,
  lightColors,
  type AppColorScheme,
  type ColorPalette,
} from '@/theme/tokens';

type AppThemeContextValue = {
  colors: ColorPalette;
  colorScheme: AppColorScheme;
  dark: boolean;
  ready: boolean;
  setDark: (enabled: boolean) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function applyPlatformTheme(colorScheme: AppColorScheme): void {
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  if (process.env.EXPO_OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dataset.appTheme = colorScheme;
    document.documentElement.style.colorScheme = colorScheme;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColor?.setAttribute('content', colors.canvas);
    return;
  }

  void SystemUI.setBackgroundColorAsync(colors.canvas);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<AppColorScheme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void readStoredColorScheme().then((stored) => {
      if (!active) return;
      const initialScheme = stored ?? 'light';
      applyPlatformTheme(initialScheme);
      setColorScheme(initialScheme);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyPlatformTheme(colorScheme);
  }, [colorScheme]);

  const setDark = useCallback((enabled: boolean) => {
    const nextScheme: AppColorScheme = enabled ? 'dark' : 'light';
    applyPlatformTheme(nextScheme);
    setColorScheme(nextScheme);
    void writeStoredColorScheme(nextScheme);
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      colors: colorScheme === 'dark' ? darkColors : lightColors,
      colorScheme,
      dark: colorScheme === 'dark',
      ready,
      setDark,
    }),
    [colorScheme, ready, setDark],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}

// The root error boundary can render before the provider is available.
export function useThemeColors(): ColorPalette {
  return useContext(AppThemeContext)?.colors ?? lightColors;
}
