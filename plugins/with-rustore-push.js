const {
  AndroidConfig,
  withAndroidManifest,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const RUSTORE_REPOSITORY = 'https://nexus-external.vkteam.ru/repository/maven/';

function upsertMetadata(application, name, value, valueKey = 'android:value') {
  application['meta-data'] ??= [];
  const existing = application['meta-data'].find(
    (entry) => entry.$?.['android:name'] === name,
  );
  const attributes = {
    'android:name': name,
    [valueKey]: value,
  };

  if (existing) {
    existing.$ = attributes;
  } else {
    application['meta-data'].push({ $: attributes });
  }
}

module.exports = function withRuStorePush(config, { projectId }) {
  if (!projectId) {
    throw new Error('RuStore Push projectId is required.');
  }

  config = withProjectBuildGradle(config, (gradleConfig) => {
    const repository = `maven { url '${RUSTORE_REPOSITORY}' }`;
    if (gradleConfig.modResults.contents.includes(RUSTORE_REPOSITORY)) {
      return gradleConfig;
    }

    const anchor = "    maven { url 'https://www.jitpack.io' }";
    if (!gradleConfig.modResults.contents.includes(anchor)) {
      throw new Error('Unable to add the RuStore Maven repository.');
    }
    gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
      anchor,
      `    ${repository}\n${anchor}`,
    );
    return gradleConfig;
  });

  return withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );
    upsertMetadata(application, 'ru.rustore.sdk.pushclient.project_id', projectId);
    upsertMetadata(
      application,
      'ru.rustore.sdk.pushclient.default_notification_icon',
      '@drawable/notification_icon',
      'android:resource',
    );
    upsertMetadata(
      application,
      'ru.rustore.sdk.pushclient.default_notification_color',
      '@color/notification_icon_color',
      'android:resource',
    );
    upsertMetadata(
      application,
      'ru.rustore.sdk.pushclient.default_notification_channel_id',
      'ride-taxi-found-v2',
    );
    return manifestConfig;
  });
};
