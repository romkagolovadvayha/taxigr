import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Такси Грахово',
  slug: config.slug ?? 'taxi-grahovo',
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
    },
  },
});
