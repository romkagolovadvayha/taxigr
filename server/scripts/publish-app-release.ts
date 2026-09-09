import { readFile, writeFile, rename } from 'node:fs/promises';
import { appReleaseManifestUrl } from '../app-releases';
import {
  appStores, compareAppVersions, parsePublishedRelease,
  type AppReleaseManifest, type AppStore,
} from '../../src/domain/app-updates';

// Run only after the version is publicly available to 100% of this store's users.
const [storeInput, version, build, ...options] = process.argv.slice(2);
if (!appStores.includes(storeInput as AppStore) || !version || !build || !options.includes('--published')) {
  throw new Error('Usage: npm run release:available -- <google-play|rustore|app-store> <version> <build> --published [--notes=TEXT] [--app-store-id=ID]');
}
const store = storeInput as AppStore;
const release = parsePublishedRelease({
  version, build, publishedAt: new Date().toISOString(),
  notes: options.find((value) => value.startsWith('--notes='))?.slice('--notes='.length),
  appStoreId: options.find((value) => value.startsWith('--app-store-id='))?.slice('--app-store-id='.length),
}, store);
if (!release) throw new Error('Invalid version, build, notes or App Store ID');
const manifest: AppReleaseManifest = JSON.parse(await readFile(appReleaseManifestUrl, 'utf8'));
if (manifest.schemaVersion !== 1 || !manifest.releases) throw new Error('Invalid manifest');
const previous = manifest.releases[store];
if (previous) {
  const versionDelta = compareAppVersions(release.version, previous.version);
  const buildDelta = compareAppVersions(release.build, previous.build);
  if (versionDelta === null || versionDelta < 0 || buildDelta === null ||
      (store === 'app-store' ? versionDelta === 0 && buildDelta <= 0 : buildDelta <= 0)) {
    throw new Error('The published version must advance. For a rollback, explicitly edit the registry.');
  }
}
manifest.releases[store] = release;
const temporaryUrl = new URL('./app-releases.json.tmp', appReleaseManifestUrl);
await writeFile(temporaryUrl, `${JSON.stringify(manifest, null, 2)}\n`);
await rename(temporaryUrl, appReleaseManifestUrl);
console.log(`Recorded ${store}: ${version} (${build}). Deploy server/app-releases.json with the API to activate the notification.`);
