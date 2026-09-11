import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { ColorPalette } from '@/theme/tokens';

// The style ships with the application; no remote JS, style download or API key.
// TileJSON can be replaced with a self-hosted OpenMapTiles-compatible endpoint.
export const MAP_TILES_URL = process.env.EXPO_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org/planet';
export const MAP_GLYPHS_URL = process.env.EXPO_PUBLIC_MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const MAP_FONT = 'Noto Sans Regular';
const name: ExpressionSpecification = ['coalesce', ['get', 'name:ru'], ['get', 'name'], ''];

export function taxiMapStyle(colors: ColorPalette, scheme: 'light' | 'dark'): StyleSpecification {
  const dark = scheme === 'dark';
  const road = dark ? '#59574F' : '#FFFFFF';
  const green = dark ? '#253D30' : '#D8E5CC';
  const water = dark ? '#274B5E' : '#B8DAE7';
  const labels = { 'text-color': colors.inkSecondary, 'text-halo-color': colors.mapFallback, 'text-halo-width': 1.5 };
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': colors.mapFallback } },
    { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]], paint: { 'fill-color': green, 'fill-opacity': .7 } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': green, 'fill-opacity': .65 } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': water } },
    { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
      paint: { 'line-color': water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 16, 5] } },
    { id: 'road-casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.borderStrong, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, .5, 12, 3, 16, 12, 19, 30] } },
    { id: 'roads', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': road, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, .3, 12, 2, 16, 10, 19, 27] } },
    { id: 'rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': colors.inkMuted, 'line-width': 1, 'line-dasharray': [3, 3] } },
    { id: 'buildings', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14, maxzoom: 15,
      paint: { 'fill-color': dark ? '#666053' : '#D0C5AC', 'fill-outline-color': colors.borderStrong } },
    { id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 15,
      paint: { 'fill-extrusion-color': dark ? '#666053' : '#D0C5AC', 'fill-extrusion-opacity': .9,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.8, ['max', 3, ['to-number', ['get', 'render_height'], 6]]],
        'fill-extrusion-base': ['to-number', ['get', 'render_min_height'], 0] } },
    { id: 'road-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 13,
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': [MAP_FONT], 'text-size': 12, 'text-max-angle': 35 }, paint: labels },
    { id: 'house-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'housenumber', minzoom: 17,
      layout: { 'text-field': ['to-string', ['get', 'housenumber']], 'text-font': [MAP_FONT], 'text-size': 11 }, paint: labels },
    { id: 'place-dots', type: 'circle', source: 'openmaptiles', 'source-layer': 'place', maxzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
      paint: { 'circle-radius': ['match', ['get', 'class'], 'city', 4, 'town', 3, 2], 'circle-color': colors.inkSecondary } },
    { id: 'place-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood']]],
      layout: { 'text-field': name, 'text-font': [MAP_FONT], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 15, 16, 17],
        'text-offset': [0, .8], 'text-anchor': 'top', 'text-max-width': 9 }, paint: labels },
  ];
  return { version: 8, name: 'Такси Грахово', glyphs: MAP_GLYPHS_URL,
    sources: { openmaptiles: { type: 'vector', url: MAP_TILES_URL,
      attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
    light: { anchor: 'viewport', color: '#FFFFFF', intensity: .3, position: [1.5, 210, 45] }, layers };
}
