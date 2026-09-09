export const appStores = ['google-play', 'rustore', 'app-store'] as const;
export type AppStore = (typeof appStores)[number];
export const applicationId = 'ru.grahovo.taxi';
export const storeNames: Record<AppStore, string> = {
  'google-play': 'Google Play',
  rustore: 'RuStore',
  'app-store': 'App Store',
};

export type InstalledApplication = {
  platform: 'android' | 'ios';
  store: AppStore;
  version: string;
  build: string;
};

export type PublishedAppRelease = {
  version: string;
  build: string;
  publishedAt: string;
  notes?: string;
  appStoreId?: string;
};

export type AppReleaseManifest = {
  schemaVersion: 1;
  releases: Record<AppStore, PublishedAppRelease | null>;
};

export type AvailableAppUpdate = PublishedAppRelease & {
  id: string;
  store: AppStore;
  storeUrl: string;
};

const versionPattern = /^\d{1,10}(?:\.\d{1,10}){0,3}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Numeric comparison also supports iOS build numbers such as 12.3.1. */
export function compareAppVersions(left: string, right: string): number | null {
  if (!versionPattern.test(left) || !versionPattern.test(right)) return null;
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  return 0;
}

export function resolveInstallationStore(
  platform: string,
  installer: string | null,
  buildStore?: string,
): AppStore | null {
  if (buildStore === 'internal') return null;
  if (platform === 'ios') return 'app-store';
  if (platform !== 'android') return null;
  if (installer === 'com.android.vending') return 'google-play';
  if (installer === 'ru.vk.store') return 'rustore';
  // Some OEM installers and restored devices lose the original package name.
  return buildStore === 'google-play' || buildStore === 'rustore' ? buildStore : null;
}

export function parsePublishedRelease(value: unknown, store: AppStore): PublishedAppRelease | null {
  if (!record(value) || typeof value.version !== 'string' || !versionPattern.test(value.version) ||
      typeof value.build !== 'string' || !versionPattern.test(value.build) ||
      typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) return null;
  if (store !== 'app-store' && (!/^[1-9]\d{0,9}$/.test(value.build) || Number(value.build) > 2_100_000_000)) return null;
  if (value.notes !== undefined && (typeof value.notes !== 'string' || value.notes.length > 500)) return null;
  if (store === 'app-store' && (typeof value.appStoreId !== 'string' || !/^[1-9]\d{4,14}$/.test(value.appStoreId))) return null;
  return {
    version: value.version,
    build: value.build,
    publishedAt: value.publishedAt,
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    ...(store === 'app-store' ? { appStoreId: value.appStoreId as string } : {}),
  };
}

export function getStoreUrl(store: AppStore, release: PublishedAppRelease): string {
  if (store === 'google-play') return `https://play.google.com/store/apps/details?id=${applicationId}`;
  if (store === 'rustore') return `https://www.rustore.ru/catalog/app/${applicationId}`;
  return `https://apps.apple.com/app/id${release.appStoreId}`;
}

export function findAvailableAppUpdate(
  manifest: unknown,
  installed: InstalledApplication,
  now = Date.now(),
): AvailableAppUpdate | null {
  if (!record(manifest) || manifest.schemaVersion !== 1 || !record(manifest.releases)) return null;
  if ((installed.platform === 'ios') !== (installed.store === 'app-store')) return null;
  const release = parsePublishedRelease(manifest.releases[installed.store], installed.store);
  if (!release || Date.parse(release.publishedAt) > now) return null;
  const versionComparison = compareAppVersions(release.version, installed.version);
  const buildComparison = compareAppVersions(release.build, installed.build);
  if (versionComparison === null || buildComparison === null || versionComparison < 0) return null;
  // Android refuses a lower/equal versionCode even when versionName is newer.
  // On iOS a new marketing version can restart its build numbering.
  if (installed.platform === 'android' ? buildComparison <= 0 : versionComparison === 0 && buildComparison <= 0) return null;
  return {
    ...release,
    store: installed.store,
    id: `${installed.store}_${release.version}_${release.build}`,
    storeUrl: getStoreUrl(installed.store, release),
  };
}

export function updatePromptStorageKey(update: AvailableAppUpdate): string {
  return `taxigr_update_seen_${update.id.replace(/-/g, '_')}`;
}
