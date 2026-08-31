import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('driver car PNG rendering', () => {
  it('does not render vehicle artwork or car icons with SVG', () => {
    const vehicleIllustration = source('src/components/vehicle/vehicle-illustration.tsx');
    const appIcon = source('src/components/ui/app-icon.tsx');
    const driverMarker = source('src/components/map/driver-marker.ts');

    expect(vehicleIllustration).toContain('economy-car.png');
    expect(vehicleIllustration).not.toContain('react-native-svg');
    expect(appIcon).toContain("if (name === 'car')");
    expect(appIcon).toContain('driver-map-car.png');
    expect(appIcon).toContain('tintColor={color}');
    expect(appIcon).not.toContain("{name === 'car' &&");
    expect(driverMarker).toContain('data:image/png;base64,iVBORw0KGgo');
    expect(driverMarker).not.toContain('<svg');
  });
});
