import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { taxiMapStyle } from '../src/components/map/map-style';
import { lightColors, darkColors } from '../src/theme/tokens';

describe('bundled MapLibre style', () => {
  it.each(['light', 'dark'] as const)('validates all expressions and layers for %s against the native style specification', scheme => {
    const style = taxiMapStyle(scheme === 'dark' ? darkColors : lightColors, scheme);
    expect(validateStyleMin(JSON.parse(JSON.stringify(style))).map(error => error.message)).toEqual([]);
    expect(new Set(style.layers.map(layer => layer.id)).size).toBe(style.layers.length);
    expect(JSON.stringify(style)).not.toMatch(/yandex|ymaps|apikey/i);
    expect(style.layers.find(layer => layer.id === 'buildings-3d')?.type).toBe('fill-extrusion');
  });
});
