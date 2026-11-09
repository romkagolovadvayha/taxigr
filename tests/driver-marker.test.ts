import { describe, expect, it } from 'vitest';

import {
  DRIVER_MARKER_HEIGHT,
  DRIVER_MARKER_WIDTH,
  driverMarkerKey,
} from '../src/components/map/driver-marker';
import { vehicleColorOptions } from '../src/domain/vehicle-colors';

describe('driver marker', () => {
  it('keeps a compact top-down footprint', () => {
    expect(DRIVER_MARKER_WIDTH).toBe(28);
    expect(DRIVER_MARKER_HEIGHT).toBe(40);
    expect(DRIVER_MARKER_HEIGHT).toBeGreaterThan(DRIVER_MARKER_WIDTH);
  });

  it.each(vehicleColorOptions)('matches the configured $key color', ({ key, hex }) => {
    expect(driverMarkerKey(hex.toLowerCase())).toBe(`taxi-driver-${key}`);
  });

  it('uses the nearest shade and falls back to yellow for missing or invalid colors', () => {
    expect(driverMarkerKey('#F6C945')).toBe('taxi-driver-yellow');
    expect(driverMarkerKey('#FFFFFF')).toBe('taxi-driver-white');
    expect(driverMarkerKey(null)).toBe('taxi-driver-yellow');
    expect(driverMarkerKey('transparent')).toBe('taxi-driver-yellow');
  });
});
