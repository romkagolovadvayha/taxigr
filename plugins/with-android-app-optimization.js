const {
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

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
  const notifications = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
  );
  const soundResources = (notifications?.[1]?.sounds ?? []).map((sound) => {
    const name = path.basename(sound, path.extname(sound));
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid Android notification sound resource: ${name}`);
    }
    return `@raw/${name}`;
  });

  // Notification channels resolve these names at runtime, outside R8's reachability graph.
  config = withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      if (soundResources.length === 0) return androidConfig;
      const rawDirectory = path.join(
        androidConfig.modRequest.platformProjectRoot,
        'app/src/main/res/raw',
      );
      await fs.mkdir(rawDirectory, { recursive: true });
      await fs.writeFile(
        path.join(rawDirectory, 'taxigr_notification_sounds_keep.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools"\n' +
          `    tools:keep="${soundResources.join(',')}" />\n`,
      );
      return androidConfig;
    },
  ]);

  config = withGradleProperties(config, (gradleConfig) => {
    // RN 0.86 / Expo 57 use the legacy DSL and external Kotlin plugin. AGP 9
    // explicitly supports these compatibility switches during migration.
    upsertGradleProperty(gradleConfig.modResults, 'android.newDsl', 'false');
    upsertGradleProperty(gradleConfig.modResults, 'android.builtInKotlin', 'false');
    // Expo autolinking passes directory providers to sourceSets and explicitly
    // wires generatePackagesList into preBuild, so no task dependency is lost.
    upsertGradleProperty(gradleConfig.modResults, 'android.sourceset.disallowProvider', 'false');
    upsertGradleProperty(
      gradleConfig.modResults,
      'android.r8.optimizedResourceShrinking',
      'true',
    );
    return gradleConfig;
  });

  config = withProjectBuildGradle(config, (gradleConfig) => {
    const dependency = /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]+)?['"]\)/;
    if (!dependency.test(gradleConfig.modResults.contents)) {
      throw new Error('Unable to pin Android Gradle Plugin: classpath was not found.');
    }
    gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
      dependency, "classpath('com.android.tools.build:gradle:9.0.1')",
    );
    return gradleConfig;
  });

  return withAppBuildGradle(config, async (gradleConfig) => {
    const edgeToEdgeScript = await fs.readFile(require.resolve('./android/edge-to-edge.gradle'), 'utf8');
    const start = '// @generated begin taxigr-edge-to-edge';
    const end = '// @generated end taxigr-edge-to-edge';
    const previous = new RegExp(`\\n${start}[\\s\\S]*?${end}\\n?`, 'g');
    gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(previous, '') +
      `\n${start}\n${edgeToEdgeScript}\n${end}\n`;
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
