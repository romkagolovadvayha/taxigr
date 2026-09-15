import type { Map as LibreMap } from 'maplibre-gl';

// `load`/`map.loaded()` wait for every source, including live route geometry and
// labels. A usable base tile can render well before those finish on a phone.
export function watchBaseMapReady(map: Pick<LibreMap, 'on' | 'off'>, onReady: () => void): () => void {
  let hasTile = false;
  let ready = false;
  const onSourceData = (event: { sourceId?: string; coord?: unknown; tile?: { state?: string } }) => {
    // MapLibre 6 emits tile completion without sourceDataType. `content` is a
    // source-change notification, not the signal that a tile has been loaded.
    if (event.sourceId === 'openmaptiles' && event.coord && event.tile?.state === 'loaded') hasTile = true;
  };
  const onRender = () => {
    if (!hasTile || ready) return;
    ready = true;
    onReady();
  };
  map.on('sourcedata', onSourceData);
  map.on('render', onRender);
  return () => {
    map.off('sourcedata', onSourceData);
    map.off('render', onRender);
  };
}
