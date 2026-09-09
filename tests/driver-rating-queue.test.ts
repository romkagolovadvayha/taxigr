import { describe, expect, it } from 'vitest';

import {
  driverRatingQueueReducer as reduce,
  emptyDriverRatingQueue,
} from '../src/domain/driver-rating-queue';
import { selectDriverOrderQueue } from '../src/domain/driver-order-queue';
import type { RideOrder } from '../src/domain/models';

function ride(id: string, overrides: Partial<RideOrder> = {}): RideOrder {
  return {
    id,
    driverId: 'driver-1',
    passengerId: `passenger-${id}`,
    passenger: { id: `passenger-${id}`, name: `Пассажир ${id}`, rating: 5, ratingCount: 0 },
    status: 'completed',
    pickup: { id: 'from', label: 'Откуда', coordinates: { latitude: 56.04, longitude: 51.95 } },
    destination: { id: 'to', label: 'Куда', coordinates: { latitude: 56.05, longitude: 51.96 } },
    tariff: 'economy',
    paymentMethod: 'cash',
    priceMinor: 15000,
    serviceCommissionMinor: 1000,
    distanceMeters: 2000,
    durationSeconds: 600,
    createdAt: '2026-09-09T18:00:00Z',
    updatedAt: '2026-09-09T18:10:00Z',
    ...overrides,
  };
}

describe('driver post-trip rating', () => {
  it('retains a completed passenger for rating after bootstrap has no active order', () => {
    const completed = ride('first');
    const ratings = reduce(emptyDriverRatingQueue, { type: 'updated', ride: completed });
    expect(selectDriverOrderQueue([completed], []).current).toBeNull();
    expect(ratings.pending).toEqual([completed]);
  });

  it.each(['completion-first', 'promotion-first'])('survives next-order promotion: %s', (sequence) => {
    const completed = ride('first');
    const next = ride('next', { status: 'accepted', driverQueuePosition: 1 });
    const events = sequence === 'completion-first' ? [completed, next] : [next, completed];
    const ratings = events.reduce((state, item) => reduce(state, { type: 'updated', ride: item }), emptyDriverRatingQueue);
    expect(selectDriverOrderQueue([completed, next], []).current?.id).toBe('next');
    expect(ratings.pending[0]?.passengerId).toBe(completed.passengerId);
  });

  it('deduplicates HTTP responses and repeated socket completion events', () => {
    const completed = ride('first');
    let state = reduce(emptyDriverRatingQueue, { type: 'updated', ride: completed });
    state = reduce(state, { type: 'updated', ride: { ...completed } });
    expect(state.pending).toHaveLength(1);
  });

  it('keeps a new offer while a different completed ride is rated', () => {
    const completed = ride('first');
    const offer = ride('offer', { status: 'searching', driverId: undefined });
    let state = reduce(emptyDriverRatingQueue, { type: 'updated', ride: completed });
    state = reduce(state, { type: 'updated', ride: offer });
    state = reduce(state, { type: 'updated', ride: { ...completed, ratings: { byDriver: 4 } } });
    expect(selectDriverOrderQueue([], [offer]).offer).toBe(offer);
    expect(state.pending[0]?.ratings?.byDriver).toBe(4);
    expect(state.pending[0]?.id).toBe('first');
  });

  it('does not reopen skipped or submitted ratings on delayed updates', () => {
    const completed = ride('first');
    let state = reduce(emptyDriverRatingQueue, { type: 'updated', ride: completed });
    state = reduce(state, { type: 'dismiss', orderId: completed.id });
    state = reduce(state, { type: 'updated', ride: completed });
    expect(state.pending).toEqual([]);

    state = reduce(state, { type: 'updated', ride: ride('rated', { ratings: { byDriver: 5 } }) });
    state = reduce(state, { type: 'updated', ride: ride('rated') });
    expect(state.pending).toEqual([]);
  });

  it('does not lose a saved score to an older completion event', () => {
    let state = reduce(emptyDriverRatingQueue, { type: 'updated', ride: ride('first') });
    state = reduce(state, { type: 'updated', ride: ride('first', { ratings: { byDriver: 5 } }) });
    state = reduce(state, { type: 'updated', ride: ride('first') });
    expect(state.pending[0]?.ratings?.byDriver).toBe(5);
  });

  it('keeps ratings for several passengers in completion order', () => {
    let state = reduce(emptyDriverRatingQueue, { type: 'updated', ride: ride('first') });
    state = reduce(state, { type: 'updated', ride: ride('second') });
    state = reduce(state, { type: 'dismiss', orderId: 'first' });
    expect(state.pending.map((item) => item.passengerId)).toEqual(['passenger-second']);
  });

  it.each(['cancelled', 'in_progress', 'driver_waiting', 'searching'] as const)('does not ask to rate %s rides', (status) => {
    expect(reduce(emptyDriverRatingQueue, { type: 'updated', ride: ride('first', { status }) }).pending).toEqual([]);
  });

  it('does not confuse the passenger score with the driver score', () => {
    const completed = ride('first', { ratings: { byPassenger: 3 } });
    expect(reduce(emptyDriverRatingQueue, { type: 'updated', ride: completed }).pending).toEqual([completed]);
  });
});
