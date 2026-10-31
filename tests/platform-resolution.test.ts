import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { getDefaultConfig } from 'expo/metro-config';
import { resolve, type ResolutionContext } from 'metro-resolver';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const config = getDefaultConfig(root);

function resolveProvider(name: string, platform: string) {
  const context: ResolutionContext = {
    allowHaste: false,
    assetExts: new Set(config.resolver.assetExts),
    customResolverOptions: {},
    disableHierarchicalLookup: true,
    doesFileExist: existsSync,
    extraNodeModules: {},
    dev: false,
    getPackage: () => null,
    getPackageForModule: () => null,
    fileSystemLookup: (file) => existsSync(file)
      ? { exists: true, type: statSync(file).isDirectory() ? 'd' : 'f', realPath: realpathSync(file) }
      : { exists: false },
    mainFields: config.resolver.resolverMainFields,
    originModulePath: path.join(root, 'src/providers/app-providers.tsx'),
    nodeModulesPaths: [],
    preferNativePlatform: platform !== 'web',
    resolveAsset: () => null,
    redirectModulePath: (file) => file,
    resolveHasteModule: () => null,
    resolveHastePackage: () => null,
    sourceExts: config.resolver.sourceExts,
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: {},
    unstable_enablePackageExports: true,
    unstable_incrementalResolution: false,
    unstable_logWarning: () => undefined,
  };
  return resolve(context, `./${name}`, platform);
}

describe('production Metro platform resolution', () => {
  it.each(['android', 'ios'])('loads the native push registrar on %s', (platform) => {
    expect(resolveProvider('notification-registrar', platform)).toEqual({
      type: 'sourceFile',
      filePath: path.join(root, 'src/providers/notification-registrar.native.tsx'),
    });
  });

  it('loads the browser push registrar on web', () => {
    expect(resolveProvider('notification-registrar', 'web')).toEqual({
      type: 'sourceFile',
      filePath: path.join(root, 'src/providers/notification-registrar.web.tsx'),
    });
  });

  it('loads the native location registrar on Android', () => {
    expect(resolveProvider('location-permission-registrar', 'android')).toEqual({
      type: 'sourceFile',
      filePath: path.join(root, 'src/providers/location-permission-registrar.native.tsx'),
    });
  });
});
