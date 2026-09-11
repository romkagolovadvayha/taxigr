import { describe, expect, it, vi } from 'vitest';
import type { Map as LibreMap } from 'maplibre-gl';
import { createRouteLayerSync } from '../src/components/map/route-layer-sync';
import { taxiMapScene } from '../src/components/map/map-scene';

function setup() {
  let source: { setData: ReturnType<typeof vi.fn> } | undefined;
  const map = {
    getSource: () => source,
    addSource: vi.fn(() => { source = { setData: vi.fn() }; }),
    addLayer: vi.fn(), setPaintProperty: vi.fn(),
  };
  return { map, typed: map as unknown as LibreMap, source: () => source!, clearStyle: () => { source = undefined; } };
}
const route = taxiMapScene({ routeCoordinates: [{ latitude: 56, longitude: 52 }, { latitude: 56.1, longitude: 52.1 }] }).route;

describe('route updates sent to the map worker', () => {
  it('does not resend road geometry or paint during repeated marker/viewport updates', () => {
    const fixture = setup(), sync = createRouteLayerSync();
    sync(fixture.typed, route, 'white', 'yellow');
    for (let i = 0; i < 100; i++) sync(fixture.typed, route, 'white', 'yellow');
    // A new label/ETA can rebuild the scene with identical geometry.
    sync(fixture.typed, JSON.parse(JSON.stringify(route)), 'white', 'yellow');
    expect(fixture.map.addSource).toHaveBeenCalledTimes(1);
    expect(fixture.map.addLayer).toHaveBeenCalledTimes(2);
    expect(fixture.source().setData).not.toHaveBeenCalled();
    expect(fixture.map.setPaintProperty).not.toHaveBeenCalled();
  });
  it('updates route changes and removal without re-adding layers', () => {
    const fixture = setup(), sync = createRouteLayerSync();
    sync(fixture.typed, route, 'white', 'yellow');
    const empty = taxiMapScene({}).route;
    sync(fixture.typed, empty, 'white', 'yellow');
    expect(fixture.source().setData).toHaveBeenCalledExactlyOnceWith(empty);
    expect(fixture.map.addLayer).toHaveBeenCalledTimes(2);
  });
  it('updates changed colors without resending geometry and restores a replaced style', () => {
    const fixture = setup(), sync = createRouteLayerSync();
    sync(fixture.typed, route, 'white', 'yellow');
    sync(fixture.typed, route, 'black', 'yellow');
    expect(fixture.map.setPaintProperty).toHaveBeenCalledExactlyOnceWith('taxi-route-outline', 'line-color', 'black');
    expect(fixture.source().setData).not.toHaveBeenCalled();
    fixture.clearStyle();
    sync(fixture.typed, route, 'black', 'yellow');
    expect(fixture.map.addSource).toHaveBeenCalledTimes(2);
    expect(fixture.map.addLayer).toHaveBeenCalledTimes(4);
  });
});
