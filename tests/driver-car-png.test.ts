import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('driver car raster rendering', () => {
  it('uses raster artwork for the vehicle illustration and map marker', () => {
    const vehicleIllustration = source('src/components/vehicle/vehicle-illustration.tsx');
    const driverMarker = source('src/components/map/driver-marker.ts');

    expect(vehicleIllustration).toContain('economy-car.webp');
    expect(vehicleIllustration).not.toContain('react-native-svg');
    expect(driverMarker).toContain('data:image/png;base64,iVBORw0KGgo');
    expect(driverMarker).not.toContain('<svg');
  });
});
