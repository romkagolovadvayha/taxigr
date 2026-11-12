import snapshot from '../data/grahovo-offline-glyphs.json';

export const bundledGlyphs = snapshot;
export const BUNDLED_GLYPHS_URL = 'https://taxi-offline.invalid/fonts/{fontstack}/{range}.pbf';
/** WebGL fetches these embedded bytes instead of a font server, even with an empty HTTP cache. */
export function bundledGlyphRequest(url: string): { url: string } {
  if (!url.startsWith('https://taxi-offline.invalid/fonts/')) return { url };
  const parts = url.split('/');
  const range = parts[parts.length-1]?.replace(/\.pbf$/, '') as keyof typeof snapshot.ranges;
  const bytes = snapshot.ranges[range];
  if (!bytes) throw new Error('Встроенный шрифт не содержит нужных символов');
  return { url: `data:application/x-protobuf;base64,${bytes}` };
}
