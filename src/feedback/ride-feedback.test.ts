import { describe, expect, it } from 'vitest';

import type { RideOrder, RideStatus } from '../domain/models';
import {
  feedbackForRideChange,
  shouldPlayRideFeedbackSound,
} from './ride-feedback';
import { createRideFeedbackTracker } from './ride-feedback-tracker';

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
  it('announces a newly created passenger search', () => {
    expect(feedbackForRideChange(null, ride('searching'), 'passenger-1', false)?.sound).toBe('searching');
    expect(feedbackForRideChange(ride('draft'), ride('searching'), 'passenger-1', false)?.sound).toBe('searching');
  });

  it.each(['cash', 'transfer', 'direct'] as const)('uses the selected %s payment and the correct rating prompt', (paymentMethod) => {
    const suffix = paymentMethod === 'direct' ? '' : `-${paymentMethod}`;
    expect(feedbackForRideChange(ride('in_progress'), ride('completed', { paymentMethod }), 'passenger-1', false)?.sound).toBe(`ride-complete${suffix}`);
    expect(feedbackForRideChange(ride('in_progress'), ride('completed', { paymentMethod }), 'driver-user', true)?.sound).toBe(`driver-complete${suffix}`);
  });

  it.each([
    ['accepted', 'order-accepted'], ['driver_arriving', 'driver-departed'],
    ['driver_waiting', 'driver-waiting'], ['in_progress', 'ride-started'],
  ] as const)('announces driver status %s', (status, sound) => {
    expect(feedbackForRideChange(ride('searching'), ride(status), 'driver-user', true)?.sound).toBe(sound);
  });

  it('explains queued acceptance and promotion separately for both participants', () => {
    const queued = ride('accepted', { driverQueuePosition: 2 });
    expect(feedbackForRideChange(ride('searching'), queued, 'passenger-1', false)?.sound).toBe('taxi-found-queued');
    expect(feedbackForRideChange(null, queued, 'driver-user', true)?.sound).toBe('order-accepted-queued');
    expect(feedbackForRideChange(queued, ride('accepted', { driverQueuePosition: 1 }), 'driver-user', true)?.sound).toBe('next-order-ready');
    expect(feedbackForRideChange(queued, ride('accepted', { driverQueuePosition: 1 }), 'passenger-1', false)?.sound).toBe('driver-ready');
  });

  it('distinguishes a driver release and different cancellation reasons', () => {
    expect(feedbackForRideChange(ride('accepted'), ride('searching'), 'passenger-1', false)?.sound).toBe('driver-released');
    expect(feedbackForRideChange(ride('accepted'), ride('searching'), 'driver-user', true)?.sound).toBe('order-released');
    expect(feedbackForRideChange(ride('accepted'), ride('cancelled', { cancellationCode: 'passenger' }), 'driver-user', true)?.sound).toBe('passenger-cancelled');
    expect(feedbackForRideChange(ride('searching'), ride('cancelled', { cancellationCode: 'search_timeout' }), 'passenger-1', false)?.sound).toBe('search-timeout');
    expect(feedbackForRideChange(ride('accepted'), ride('cancelled', { cancellationCode: 'admin' }), 'driver-user', true)?.sound).toBe('admin-cancelled');
  });
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

  it('announces departure separately from finding a driver', () => {
    expect(feedbackForRideChange(ride('accepted'), ride('driver_arriving'), 'passenger-1', false)?.sound).toBe('driver-arriving');
  });

  it('distinguishes a higher priced offer from a new order', () => {
    expect(feedbackForRideChange(ride('searching'), ride('searching', { priceMinor: 40_000 }), 'driver-user', true)?.sound).toBe('order-updated');
    expect(feedbackForRideChange(ride('searching'), ride('searching', { priceMinor: 40_000 }), 'passenger-1', false)).toBeNull();
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

describe('ride feedback tracking across concurrent orders', () => {
  it('preserves completion before the next order is promoted in one render', () => {
    const tracker = createRideFeedbackTracker();
    const next = ride('accepted', { id: 'ride-2', driverQueuePosition: 2 });
    tracker.seed([ride('in_progress'), next]);
    expect(tracker.observe(ride('completed'), 'driver-user', true)?.feedback.sound).toBe('driver-complete-cash');
    expect(tracker.observe({ ...next, driverQueuePosition: 1 }, 'driver-user', true)?.feedback.sound).toBe('next-order-ready');
  });

  it('announces cancellation of a queued order even if the UI removes it', () => {
    const tracker = createRideFeedbackTracker();
    tracker.seed([ride('in_progress'), ride('accepted', { id: 'ride-2', driverQueuePosition: 2 })]);
    expect(tracker.observe(ride('cancelled', { id: 'ride-2', cancellationCode: 'passenger' }), 'driver-user', true)?.feedback.sound).toBe('passenger-cancelled');
  });

  it('suppresses duplicate snapshots and stale updates but allows another driver search cycle', () => {
    const tracker = createRideFeedbackTracker();
    const searching = ride('searching');
    const found = ride('accepted', { updatedAt: '2026-07-30T08:00:01.000Z' });
    tracker.seed([searching]);
    const first = tracker.observe(found, 'passenger-1', false);
    expect(first?.feedback.sound).toBe('taxi-found');
    expect(tracker.observe({ ...found }, 'passenger-1', false)).toBeNull();
    expect(tracker.observe(searching, 'passenger-1', false)).toBeNull();
    expect(tracker.observe({ ...searching, updatedAt: '2026-07-30T08:00:02.000Z' }, 'passenger-1', false)?.feedback.sound).toBe('driver-released');
    const second = tracker.observe({ ...found, updatedAt: '2026-07-30T08:00:03.000Z' }, 'passenger-1', false);
    expect(second?.feedback.sound).toBe('taxi-found');
    expect(second?.key).not.toBe(first?.key);
  });

  it('does not re-announce an offer from two subscriptions, but announces a returned offer', () => {
    const tracker = createRideFeedbackTracker();
    expect(tracker.observe(ride('searching'), 'driver-user', true)?.feedback.sound).toBe('new-order');
    expect(tracker.observe(ride('searching'), 'driver-user', true)).toBeNull();
    expect(tracker.observe(ride('searching', { updatedAt: '2026-07-30T08:01:00.000Z' }), 'driver-user', true)?.feedback.sound).toBe('new-order');
  });
});

describe('shouldPlayRideFeedbackSound', () => {
  it('does not autoplay on web before the user interacts', () => {
    expect(shouldPlayRideFeedbackSound(true, false)).toBe(false);
  });

  it('allows subsequent web announcements after the user interacts', () => {
    expect(shouldPlayRideFeedbackSound(true, true)).toBe(true);
  });

  it('keeps automatic ride sounds on native platforms', () => {
    expect(shouldPlayRideFeedbackSound(false, false)).toBe(true);
  });
});
