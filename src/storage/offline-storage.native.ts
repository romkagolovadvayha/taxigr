import * as FileSystem from 'expo-file-system/legacy';
const path = () => FileSystem.documentDirectory ? `${FileSystem.documentDirectory}taxigr-offline-v1.json` : null;
export async function readOfflineData(): Promise<string | null> {
  try {
    const file = path(); if (!file) return null;
    const info = await FileSystem.getInfoAsync(file);
    return info.exists && info.size <= 2_000_000 ? await FileSystem.readAsStringAsync(file) : null;
  } catch { return null; }
}
export async function writeOfflineData(value: string): Promise<void> {
  const file = path(); if (!file) return;
  // Write complete snapshots atomically; a process exit cannot leave half a JSON document.
  await FileSystem.writeAsStringAsync(`${file}.tmp`,value);
  await FileSystem.moveAsync({from:`${file}.tmp`,to:file});
}
