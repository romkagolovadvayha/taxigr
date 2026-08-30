import { describe, expect, it } from 'vitest';

import {
  createVehicleColorPalette,
  fallbackVehicleColorHex,
  inferVehicleColorHex,
  normalizeVehicleColorHex,
  vehicleColorOptions,
} from '../src/domain/vehicle-colors';

describe('vehicle colors', () => {
  it('offers a complete set of common car colors', () => {
    expect(vehicleColorOptions.length).toBeGreaterThanOrEqual(16);
    expect(vehicleColorOptions.map((option) => option.name)).toEqual(
      expect.arrayContaining(['Белая', 'Чёрная', 'Серебристая', 'Синяя', 'Красная']),
    );
    expect(new Set(vehicleColorOptions.map((option) => option.hex)).size).toBe(
      vehicleColorOptions.length,
    );
  });

  it('maps common custom descriptions to a representative color', () => {
    expect(inferVehicleColorHex('Мокрый асфальт')).toBe('#777C84');
    expect(inferVehicleColorHex('Вишнёвая')).toBe('#721F2C');
    expect(inferVehicleColorHex('Тёмно-зелёная')).toBe('#1F5134');
  });

  it('normalizes safe hex values and rejects arbitrary input', () => {
    expect(normalizeVehicleColorHex('#d64545')).toBe('#D64545');
    expect(normalizeVehicleColorHex('red')).toBe(fallbackVehicleColorHex);
  });

  it('creates visible highlight and shadow variants for every popular color', () => {
    for (const option of vehicleColorOptions) {
      const palette = createVehicleColorPalette(option.hex);
      expect(palette.body).toBe(option.hex.toUpperCase());
      expect(palette.highlight).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.shadow).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.highlight).not.toBe(palette.shadow);
    }
  });
});
