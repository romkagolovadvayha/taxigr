import { describe, expect, it, vi } from 'vitest';
import { getOfflineDistrict } from '../src/offline/district';
import { bundledGlyphRequest, BUNDLED_GLYPHS_URL, bundledGlyphs } from '../src/offline/map-glyphs';
import { createOfflineRouter, getOfflineRoadRoute } from '../src/offline/road-route';
import { taxiMapStyle } from '../src/components/map/map-style';
import { lightColors, darkColors } from '../src/theme/tokens';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { resolvePickupAddress } from '../src/api/pickup-address';

describe('embedded district, with no HTTP cache or network', () => {
  it('labels a local GPS position without contacting the API or moving the position', async () => {
    const fetch=vi.fn(()=>{throw new Error('No servers');}); vi.stubGlobal('fetch',fetch);
    try {
      const gps={latitude:56.0477,longitude:51.9586};
      const address=await resolvePickupAddress(gps,{token:'local-test'});
      expect(address?.coordinates).toEqual(gps);
      expect(address?.label).not.toBe('Точка на карте');
      expect(address?.houseNumber).toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('ships houses, road names, settlements and all glyph ranges used by their labels', () => {
    const fetch = vi.fn(()=>{throw new Error('Network forbidden');}); vi.stubGlobal('fetch',fetch);
    try {
      const data = getOfflineDistrict();
      expect(data.map.features.filter(f=>f.properties?.kind === 'building').length).toBeGreaterThan(4000);
      expect(data.map.features.some(f=>f.properties?.kind === 'road' && f.properties?.name)).toBe(true);
      expect(data.map.features.some(f=>f.properties?.kind === 'place' && f.properties?.name === 'Грахово')).toBe(true);
      for (const feature of data.map.features) for (const character of feature.properties?.name ?? '') {
        const start = Math.floor(character.codePointAt(0)!/256)*256;
        expect(bundledGlyphs.ranges).toHaveProperty(`${start}-${start+255}`);
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(['light','dark'] as const)('validates the full offline style for %s, including local labels', scheme => {
    const style = taxiMapStyle(scheme === 'dark' ? darkColors : lightColors,scheme,true,'file:///app/fonts/{fontstack}/{range}.pbf');
    expect(validateStyleMin(JSON.parse(JSON.stringify(style))).map(e=>e.message)).toEqual([]);
    expect(Object.values(style.sources).every(s=>s.type === 'geojson' && typeof s.data !== 'string')).toBe(true);
    expect(style.layers.some(l=>l.id === 'district-house-label')).toBe(true);
  });
  it('serves web glyphs from the bundle instead of the dummy URL', () => {
    expect(bundledGlyphRequest(BUNDLED_GLYPHS_URL.replace('{fontstack}','Noto%20Sans%20Regular').replace('{range}','1024-1279')).url).toMatch(/^data:application\/x-protobuf;base64,/);
    expect(bundledGlyphRequest('https://example.org/map')).toEqual({url:'https://example.org/map'});
  });
});

describe('local road routing', () => {
  const coord = (longitude:number,latitude=56)=>({longitude,latitude});
  it('routes a real trip through Grahovo along many road vertices without any fetch', () => {
    const route = getOfflineRoadRoute({latitude:56.04758,longitude:51.95842},[{latitude:56.052,longitude:51.965}]);
    expect(route.source).toBe('offline');
    expect(route.coordinates.length).toBeGreaterThan(3);
    expect(route.distanceMeters).toBeGreaterThan(500);
    expect(route.distanceMeters).toBeLessThan(5000);
  });
  it('preserves an intermediate stop and rejects remote points', () => {
    const a={latitude:56.04758,longitude:51.95842}, b={latitude:56.052,longitude:51.965};
    const route=getOfflineRoadRoute(a,[b,a]);
    expect(route.distanceMeters).toBeGreaterThan(getOfflineRoadRoute(a,[b]).distanceMeters*1.8);
    expect(()=>getOfflineRoadRoute(a,[{latitude:55.75,longitude:37.61}])).toThrow(/дороги/);
  });
  it('does not drive against a one-way road', () => {
    const route=createOfflineRouter({nodes:[[51,56],[51.01,56]],edges:[[0,1,1,30]]});
    expect(route(coord(51.002),[coord(51.008)]).distanceMeters).toBeGreaterThan(300);
    expect(()=>route(coord(51.008),[coord(51.002)])).toThrow(/связного/);
  });
  it('does not join disconnected crossing roads or invent a straight route', () => {
    const route=createOfflineRouter({nodes:[[51,56],[51.02,56],[51.01,55.99],[51.01,56.01]],edges:[[0,1,0,30],[2,3,0,30]]});
    expect(()=>route(coord(51.002),[coord(51.01,56.008)])).toThrow(/связного/);
  });
});
