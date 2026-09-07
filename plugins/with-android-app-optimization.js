const {
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins');

const OPTIMIZED_PROGUARD_FILE =
  'getDefaultProguardFile("proguard-android-optimize.txt")';
const UNOPTIMIZED_PROGUARD_FILE =
  'getDefaultProguardFile("proguard-android.txt")';

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find(
    (property) => property.type === 'property' && property.key === key,
  );

  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

module.exports = function withAndroidAppOptimization(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    upsertGradleProperty(
      gradleConfig.modResults,
      'android.r8.optimizedResourceShrinking',
      'true',
    );
    return gradleConfig;
  });

  return withAppBuildGradle(config, (gradleConfig) => {
    const { contents } = gradleConfig.modResults;

    if (contents.includes(OPTIMIZED_PROGUARD_FILE)) {
      return gradleConfig;
    }

    if (!contents.includes(UNOPTIMIZED_PROGUARD_FILE)) {
      throw new Error(
        'Unable to enable full R8 optimization: default ProGuard file was not found.',
      );
    }

    gradleConfig.modResults.contents = contents.replace(
      UNOPTIMIZED_PROGUARD_FILE,
      OPTIMIZED_PROGUARD_FILE,
    );
    return gradleConfig;
  });
};
