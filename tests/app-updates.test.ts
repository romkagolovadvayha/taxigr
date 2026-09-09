import { describe, expect, it } from 'vitest';
import {
  compareAppVersions, findAvailableAppUpdate, resolveInstallationStore, updatePromptStorageKey,
  type AppStore, type InstalledApplication,
} from '../src/domain/app-updates';

const release = { version: '1.0.11', build: '31', publishedAt: '2026-09-01T00:00:00Z', notes: 'Улучшения' };
const installed: InstalledApplication = { platform: 'android', store: 'rustore', version: '1.0.10', build: '29' };
const manifest = (store: AppStore = 'rustore', value: unknown = release) => ({ schemaVersion: 1, releases: { [store]: value } });
const now = Date.parse('2026-09-09T00:00:00Z');

describe('app versions and installation stores', () => {
  it.each([
    ['1.0.10', '1.0.9', 1], ['1.10', '1.9.99', 1], ['1.0', '1.0.0', 0],
    ['2.0', '3.0', -1], ['12.3.1', '12.3.0', 1], ['bad', '1.0', null],
    ['1.0-beta', '1.0', null], ['', '1.0', null],
  ])('compares %s and %s numerically', (a, b, expected) => {
    expect(compareAppVersions(a as string, b as string)).toBe(expected);
  });

  it.each([
    ['android', 'ru.vk.store', 'google-play', 'rustore'],
    ['android', 'com.android.vending', 'rustore', 'google-play'],
    ['android', null, 'rustore', 'rustore'],
    ['android', 'com.miui.packageinstaller', 'rustore', 'rustore'],
    ['android', null, undefined, null],
    ['android', 'com.unknown.store', undefined, null],
    ['android', 'com.android.vending', 'internal', null],
    ['ios', null, 'google-play', 'app-store'],
    ['ios', null, 'internal', null],
    ['web', null, 'rustore', null],
  ])('resolves %s / %s / %s to %s', (platform, installer, hint, expected) => {
    expect(resolveInstallationStore(platform!, installer ?? null, hint ?? undefined)).toBe(expected);
  });
});

describe('published releases', () => {
  it('selects only the actual installation store and constructs its trusted URL', () => {
    const available = findAvailableAppUpdate(manifest(), installed, now)!;
    expect(available.storeUrl).toBe('https://www.rustore.ru/catalog/app/ru.grahovo.taxi');
    expect(findAvailableAppUpdate(manifest('google-play'), installed, now)).toBeNull();
    expect(updatePromptStorageKey(available)).toMatch(/^[\w.]+$/);
    expect(findAvailableAppUpdate(manifest('google-play'), { ...installed, store: 'google-play' }, now)?.storeUrl)
      .toBe('https://play.google.com/store/apps/details?id=ru.grahovo.taxi');
  });

  it.each([
    null, {}, { schemaVersion: 2, releases: { rustore: release } },
    manifest('rustore', null), manifest('rustore', { ...release, version: 'pending' }),
    manifest('rustore', { ...release, build: '-31' }),
    manifest('rustore', { ...release, build: '31.1' }),
    manifest('rustore', { ...release, notes: 'x'.repeat(501) }),
    manifest('rustore', { ...release, publishedAt: '2099-01-01T00:00:00Z' }),
    manifest('rustore', { ...release, publishedAt: 'bad' }),
  ])('ignores malformed, unpublished and future releases %#', (value) => {
    expect(findAvailableAppUpdate(value, installed, now)).toBeNull();
  });

  it.each([
    ['1.0.11', '31', false], ['1.0.12', '32', false], ['1.0.10', '29', true],
    ['1.0.11', '30', true], ['1.0.10', '32', false], ['bad', '29', false],
  ])('installed Android %s (%s), update available: %s', (version, build, expected) => {
    expect(!!findAvailableAppUpdate(manifest(), { ...installed, version, build }, now)).toBe(expected);
  });

  it('supports iOS build numbering and requires a real numeric App Store id', () => {
    const ios: InstalledApplication = { ...installed, platform: 'ios', store: 'app-store', build: '99.1' };
    expect(findAvailableAppUpdate(manifest('app-store', release), ios, now)).toBeNull();
    const iosRelease = { ...release, build: '1', appStoreId: '1234567890' };
    expect(findAvailableAppUpdate(manifest('app-store', iosRelease), ios, now)?.storeUrl)
      .toBe('https://apps.apple.com/app/id1234567890');
    expect(findAvailableAppUpdate(manifest('app-store', iosRelease), { ...ios, version: release.version }, now)).toBeNull();
  });

  it('does not accept server-controlled redirect URLs or incompatible stores', () => {
    const value = { ...release, storeUrl: 'https://untrusted.example', id: 'fake' };
    expect(findAvailableAppUpdate(manifest('rustore', value), installed, now)?.storeUrl).toContain('www.rustore.ru');
    expect(findAvailableAppUpdate(manifest(), { ...installed, platform: 'ios' }, now)).toBeNull();
  });
});
