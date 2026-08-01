import { describe, expect, it } from 'vitest';

import type { RideOrder, RideStatus } from '../domain/models';
import {
  feedbackForRideChange,
  shouldPlayRideFeedbackSound,
} from './ride-feedback';

function ride(status: RideStatus, overrides: Partial<RideOrder> = {}): RideOrder {
  return {
    id: 'ride-1',
    passengerId: 'passenger-1',
    pickup: {
      id: 'a',
      label: 'Грахово, ул. Ачинцева, 5',
      coordinates: { latitude: 56.0477, longitude: 51.9586 },
    },
    destination: {
      id: 'b',
      label: 'Грахово, ул. Колпакова, 1Б',
      coordinates: { latitude: 56.04576, longitude: 51.96165 },
    },
    tariff: 'economy',
    status,
    priceMinor: 35_000,
    serviceCommissionMinor: 4_200,
    distanceMeters: 2_000,
    durationSeconds: 420,
    paymentMethod: 'cash',
    createdAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    ...overrides,
  };
}

describe('feedbackForRideChange', () => {
  it('does not announce a passenger order while it is first restored', () => {
    expect(feedbackForRideChange(null, ride('accepted'), 'passenger-1', false)).toBeNull();
  });

  it('announces when a passenger gets a driver', () => {
    expect(
      feedbackForRideChange(ride('searching'), ride('accepted'), 'passenger-1', false)?.kind,
    ).toBe('taxi-found');
  });

  it('announces when the driver arrives', () => {
    expect(
      feedbackForRideChange(
        ride('driver_arriving'),
        ride('driver_waiting'),
        'passenger-1',
        false,
      )?.kind,
    ).toBe('driver-arrived');
  });

  it('plays a dedicated sound when the trip starts', () => {
    expect(
      feedbackForRideChange(
        ride('driver_waiting'),
        ride('in_progress'),
        'passenger-1',
        false,
      )?.sound,
    ).toBe('ride-started');
  });

  it('announces a new offer to a driver', () => {
    expect(feedbackForRideChange(null, ride('searching'), 'driver-user', true)?.kind).toBe(
      'new-order',
    );
  });

  it('does not announce driver location-only updates', () => {
    expect(
      feedbackForRideChange(
        ride('driver_arriving'),
        ride('driver_arriving', { updatedAt: '2026-07-30T08:00:05.000Z' }),
        'passenger-1',
        false,
      ),
    ).toBeNull();
  });
});

describe('shouldPlayRideFeedbackSound', () => {
  it('does not autoplay status sounds on web', () => {
    expect(shouldPlayRideFeedbackSound(true, false)).toBe(false);
  });

  it('allows a web sound started by an explicit user action', () => {
    expect(shouldPlayRideFeedbackSound(true, true)).toBe(true);
  });

  it('keeps automatic ride sounds on native platforms', () => {
    expect(shouldPlayRideFeedbackSound(false, false)).toBe(true);
  });
});
