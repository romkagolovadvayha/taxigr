import { requireOptionalNativeModule } from 'expo-modules-core';

export default requireOptionalNativeModule<{
  openMaxUrl(url: string): Promise<boolean>;
  openVkMiniAppUrl?(url: string): Promise<boolean>;
}>('TaxigrExternalAuth');
