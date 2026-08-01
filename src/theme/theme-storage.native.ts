import * as SecureStore from 'expo-secure-store';

import type { AppColorScheme } from '@/theme/tokens';

export const THEME_STORAGE_KEY = 'taxi_grahovo_color_scheme';

export async function readStoredColorScheme(): Promise<AppColorScheme | null> {
  try {
    const stored = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

export async function writeStoredColorScheme(scheme: AppColorScheme): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_STORAGE_KEY, scheme);
  } catch {
    // A theme preference must never prevent the app from working.
  }
}
