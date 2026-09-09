import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';
import InstallSource from '../../modules/taxigr-install-source';
import {
  applicationId, resolveInstallationStore,
  type AvailableAppUpdate, type InstalledApplication,
} from '@/domain/app-updates';

export async function getInstalledApplication(): Promise<InstalledApplication | null> {
  if (__DEV__ || Application.applicationId !== applicationId ||
      !Application.nativeApplicationVersion || !Application.nativeBuildVersion) return null;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (Platform.OS === 'ios') {
    try {
      if (await Application.getIosApplicationReleaseTypeAsync() !== Application.ApplicationReleaseType.APP_STORE) return null;
    } catch {
      return null;
    }
  }
  let installer: string | null = null;
  try { installer = InstallSource?.getInstallerPackageName() ?? null; } catch { /* Use the build channel. */ }
  const store = resolveInstallationStore(Platform.OS, installer, process.env.EXPO_PUBLIC_DISTRIBUTION_STORE);
  if (!store) return null;
  return {
    platform: Platform.OS, store,
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
  };
}

export async function openApplicationStore(update: AvailableAppUpdate): Promise<void> {
  if (Platform.OS === 'android' && update.store !== 'app-store') {
    try {
      if (await InstallSource?.openStore(update.store)) return;
    } catch { /* A removed store can still be opened on its website. */ }
  }
  await Linking.openURL(update.storeUrl);
}
