import { describe, expect, it } from 'vitest';

import {
  distanceBetweenCoordinates,
  estimatePickupEtaMinutes,
} from '../src/domain/pickup-eta';

const pickup = { latitude: 54.9726, longitude: 48.2831 };

describe('pickup ETA', () => {
  it('estimates arrival from the latest driver coordinates', () => {
    const nearbyDriver = { latitude: 54.9696, longitude: 48.2831 };
    const farDriver = { latitude: 54.9456, longitude: 48.2831 };

    expect(
      estimatePickupEtaMinutes({ driver: nearbyDriver, pickup, status: 'driver_arriving' }),
    ).toBeLessThan(
      estimatePickupEtaMinutes({ driver: farDriver, pickup, status: 'driver_arriving' })!,
    );
    expect(distanceBetweenCoordinates(nearbyDriver, pickup)).toBeGreaterThan(300);
  });

  it('shows one minute when the driver is already very close', () => {
    expect(
      estimatePickupEtaMinutes({ driver: pickup, pickup, status: 'accepted' }),
    ).toBe(1);
  });

  it('switches to arrived and hides ETA outside the approach phase', () => {
    expect(
      estimatePickupEtaMinutes({ driver: pickup, pickup, status: 'driver_waiting' }),
    ).toBe(0);
    expect(
      estimatePickupEtaMinutes({ driver: pickup, pickup, status: 'in_progress' }),
    ).toBeNull();
    expect(
      estimatePickupEtaMinutes({ pickup, status: 'driver_arriving' }),
    ).toBeNull();
  });
});
