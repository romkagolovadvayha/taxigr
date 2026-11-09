import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { vehicleColorOptions } from '../src/domain/vehicle-colors';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('driver car raster rendering', () => {
  it('uses transparent raster artwork for every map marker color', async () => {
    const vehicleIllustration = source('src/components/vehicle/vehicle-illustration.tsx');
    const assets = source('src/components/map/driver-marker-assets.ts');

    expect(vehicleIllustration).toContain('economy-car.webp');
    expect(vehicleIllustration).not.toContain('react-native-svg');
    for (const { key } of vehicleColorOptions) {
      const path = key === 'yellow' ? 'assets/vehicles/driver-map-car.png' : `assets/vehicles/map/${key}.png`;
      expect(assets).toContain(`'taxi-driver-${key}': require('../../../${path}')`);
      const metadata = await sharp(path).metadata();
      expect(metadata).toMatchObject({ format: 'png', width: 84, height: 120, hasAlpha: true });
    }
  });
});
