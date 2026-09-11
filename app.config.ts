import type { ConfigContext, ExpoConfig } from 'expo/config';

const { prepareMapLibreWeb } = require('./scripts/prepare-maplibre-web.cjs');
prepareMapLibreWeb();

export default ({ config }: ConfigContext): ExpoConfig => {
  const rustorePushEnabled = process.env.RUSTORE_PUSH_ENABLED === 'true';
  const rustorePushProjectId = process.env.RUSTORE_PUSH_PROJECT_ID?.trim();
  if (rustorePushEnabled && !rustorePushProjectId) {
    throw new Error('RUSTORE_PUSH_PROJECT_ID is required for the RuStore build profile.');
  }

  const android = { ...config.android };
  if (rustorePushEnabled) delete android.googleServicesFile;
  const rustorePlugins: NonNullable<ExpoConfig['plugins']> = rustorePushEnabled
    ? [['./plugins/with-rustore-push', { projectId: rustorePushProjectId! }]]
    : [];

  return {
    ...config,
    name: config.name ?? 'Такси Грахово',
    slug: config.slug ?? 'taxi-grahovo',
    android,
    plugins: [
      ...(config.plugins ?? []),
      'expo-image',
      '@maplibre/maplibre-react-native',
      ...rustorePlugins,
    ],
    extra: {
      ...config.extra,
      nativePushProvider: rustorePushEnabled ? 'rustore' : 'expo',
      eas: {
        ...config.extra?.eas,
        projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
      },
    },
  };
};
