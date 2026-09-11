import { OfflineManager } from '@maplibre/maplibre-react-native';

// MapLibre's on-device database stores visited vector tiles, glyphs and source
// metadata across restarts. Let it honor the server's expiry/revalidation rules.
// This is a ceiling, not an eager download or allocation of this much storage.
const MAP_CACHE_BYTES = 128 * 1024 * 1024;
let configured: Promise<void> | undefined;

export function configureNativeMapCache(): Promise<void> {
  configured ??= OfflineManager.setMaximumAmbientCacheSize(MAP_CACHE_BYTES)
    .catch(() => { configured = undefined; });
  return configured;
}
