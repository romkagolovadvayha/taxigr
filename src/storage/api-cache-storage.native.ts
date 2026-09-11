import * as FileSystem from 'expo-file-system/legacy';

function path() { return FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}taxigr-address-cache-v1.json` : null; }
export async function readApiCache(): Promise<string | null> {
  try {
    const file = path();
    if (!file) return null;
    const info = await FileSystem.getInfoAsync(file);
    return info.exists && info.size <= 512_000 ? await FileSystem.readAsStringAsync(file) : null;
  } catch { return null; }
}
export async function writeApiCache(value: string): Promise<void> {
  try { const file = path(); if (file) await FileSystem.writeAsStringAsync(file, value); } catch { /* Cache eviction is harmless. */ }
}
