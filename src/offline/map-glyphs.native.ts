import * as FileSystem from 'expo-file-system/legacy';
import snapshot from '../data/grahovo-offline-glyphs.json';

let preparing: Promise<string> | undefined;
/** All bytes are in the JS bundle. Extraction uses no Asset download or network request. */
export function prepareBundledGlyphs(): Promise<string> {
  preparing ??= (async () => {
    if (!FileSystem.documentDirectory) throw new Error('Хранилище карты недоступно');
    const root = `${FileSystem.documentDirectory}offline-map-${snapshot.revision}/fonts/`;
    await FileSystem.makeDirectoryAsync(`${root}${snapshot.font}`, { intermediates: true });
    for (const [range, bytes] of Object.entries(snapshot.ranges)) {
      const path = `${root}${snapshot.font}/${range}.pbf`;
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists || info.size !== Math.floor(bytes.length * 3 / 4) - (bytes.endsWith('==') ? 2 : bytes.endsWith('=') ? 1 : 0)) {
        await FileSystem.writeAsStringAsync(path, bytes, { encoding: FileSystem.EncodingType.Base64 });
      }
    }
    return `${root}{fontstack}/{range}.pbf`;
  })().catch(error => { preparing = undefined; throw error; });
  return preparing;
}
