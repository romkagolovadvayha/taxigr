import type { AvailableAppUpdate, InstalledApplication } from '@/domain/app-updates';

// Websites and installed PWAs update through the web, not a native app store.
export async function getInstalledApplication(): Promise<InstalledApplication | null> {
  return null;
}

export async function openApplicationStore(_update: AvailableAppUpdate): Promise<void> {}
