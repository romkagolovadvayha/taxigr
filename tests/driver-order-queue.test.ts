import { describe, expect, it } from 'vitest';

import {
  isQueuedDriverOrder,
  maximumAssignedDriverOrders,
  selectDriverOrderQueue,
} from '../src/domain/driver-order-queue';
import type { RideOrder } from '../src/domain/models';

function ride(
  id: string,
  status: RideOrder['status'],
  driverQueuePosition?: 1 | 2,
): RideOrder {
  return {
    id,
    passengerId: `passenger-${id}`,
    driverId: status === 'searching' ? undefined : 'driver-1',
    driverQueuePosition,
    pickup: {
      id: `pickup-${id}`,
      label: 'Подача',
      coordinates: { latitude: 56.04, longitude: 51.95 },
    },
    destination: {
      id: `destination-${id}`,
      label: 'Назначение',
      coordinates: { latitude: 56.05, longitude: 51.96 },
    },
    tariff: 'economy',
    status,
    priceMinor: 500_00,
    serviceCommissionMinor: 25_00,
    distanceMeters: 2_000,
    durationSeconds: 600,
    paymentMethod: 'cash',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}

describe('driver order queue state machine', () => {
  it('keeps exactly one current and one next order', () => {
    const current = ride('current', 'in_progress', 1);
    const next = ride('next', 'accepted', 2);
    const offer = ride('offer', 'searching');

    expect(selectDriverOrderQueue([next, current], [offer])).toEqual({
      current,
      next,
      offer: null,
    });
    expect(maximumAssignedDriverOrders).toBe(2);
  });

  it('offers a second order while only the current slot is occupied', () => {
    const current = ride('current', 'driver_arriving', 1);
    const offer = ride('offer', 'searching');

    expect(selectDriverOrderQueue([current], [offer])).toEqual({
      current,
      next: null,
      offer,
    });
  });

  it('does not treat a queued order as the navigable current ride', () => {
    const next = ride('next', 'accepted', 2);
    expect(isQueuedDriverOrder(next)).toBe(true);
    expect(selectDriverOrderQueue([next], []).current).toBeNull();
  });
});
