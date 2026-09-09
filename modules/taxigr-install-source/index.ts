import { requireOptionalNativeModule } from 'expo-modules-core';

export default requireOptionalNativeModule<{
  getInstallerPackageName(): string | null;
  openStore(store: 'google-play' | 'rustore'): Promise<boolean>;
}>('TaxigrInstallSource');
