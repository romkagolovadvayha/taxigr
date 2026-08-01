import type { AppColorScheme } from '@/theme/tokens';

export const THEME_STORAGE_KEY = 'taxi_grahovo_color_scheme';

// TypeScript fallback. Metro selects the platform-specific implementation.
export async function readStoredColorScheme(): Promise<AppColorScheme | null> {
  return null;
}

export async function writeStoredColorScheme(_scheme: AppColorScheme): Promise<void> {}
