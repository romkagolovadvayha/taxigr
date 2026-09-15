import type { Map as LibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { watchBaseMapReady } from '../src/components/map/map-readiness.web';

function setup() {
  const listeners = new Map<string, Set<(event: object) => void>>();
  const map = {
    on: (name: string, fn: (event: object) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    off: (name: string, fn: (event: object) => void) => listeners.get(name)?.delete(fn),
  };
  const ready = vi.fn();
  const stop = watchBaseMapReady(map as unknown as LibreMap, ready);
  const emit = (name: string, event = {}) => listeners.get(name)?.forEach(fn => fn(event));
  return { ready, stop, emit };
}
// This is the v6 tile-completion event shape: it has no sourceDataType.
const tile = { sourceId: 'openmaptiles', tile: { state: 'loaded' }, coord: { z: 14, x: 10556, y: 5100 } };

describe('progressive base map readiness', () => {
  it('does not mistake the background, source metadata or route data for a map', () => {
    const { emit, ready } = setup();
    emit('load'); emit('render');
    emit('sourcedata', { sourceId: 'openmaptiles', sourceDataType: 'metadata' }); emit('render');
    emit('sourcedata', { sourceId: 'openmaptiles', sourceDataType: 'content' }); emit('render');
    emit('sourcedata', { ...tile, tile: { state: 'errored' } }); emit('render');
    emit('sourcedata', { ...tile, coord: undefined }); emit('render');
    emit('sourcedata', { ...tile, sourceId: 'taxi-route' }); emit('render');
    expect(ready).not.toHaveBeenCalled();
  });
  it('finishes after a base tile renders even while other sources are still loading', () => {
    const { emit, ready } = setup();
    emit('sourcedata', tile);
    expect(ready).not.toHaveBeenCalled();
    emit('render');
    expect(ready).toHaveBeenCalledTimes(1);
    emit('sourcedata', tile); emit('render'); emit('load');
    expect(ready).toHaveBeenCalledTimes(1);
  });
  it('recovers when a good tile arrives after a failed request or timeout', () => {
    const { emit, ready } = setup();
    emit('error'); emit('render');
    expect(ready).not.toHaveBeenCalled();
    emit('sourcedata', tile); emit('render');
    expect(ready).toHaveBeenCalledTimes(1);
  });
  it('ignores completion after the map has been removed or retried', () => {
    const { emit, ready, stop } = setup();
    emit('sourcedata', tile); stop(); emit('render');
    expect(ready).not.toHaveBeenCalled();
  });
});
