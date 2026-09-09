import { requireOptionalNativeModule } from 'expo-modules-core';

export default requireOptionalNativeModule<{
  prepare(): Promise<void>;
}>('TaxigrWebViewStartup');
