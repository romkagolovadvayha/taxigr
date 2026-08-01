import { describe, expect, it } from 'vitest';

import { buildDestinationHistory } from '../src/domain/address-history';
import type { Address, RideOrder } from '../src/domain/models';

const pickup: Address = {
  id: 'pickup',
  label: 'с. Грахово',
  coordinates: { latitude: 56.0477, longitude: 51.9586 },
};
const frequent: Address = {
  id: 'frequent',
  label: 'ул. Советская, 10',
  coordinates: { latitude: 56.04, longitude: 51.95 },
};
const latest: Address = {
  id: 'latest',
  label: 'ул. Ачинцева, 5',
  coordinates: { latitude: 56.05, longitude: 51.96 },
};

function order(
  id: string,
  destination: Address,
  updatedAt: string,
  status: RideOrder['status'] = 'completed',
): RideOrder {
  return {
    id,
    passengerId: 'passenger',
    pickup,
    destination,
    tariff: 'economy',
    status,
    priceMinor: 20_000,
    serviceCommissionMinor: 2_400,
    distanceMeters: 1_000,
    durationSeconds: 300,
    paymentMethod: 'cash',
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('destination history', () => {
  it('sorts completed destinations by frequency and then recency', () => {
    const history = buildDestinationHistory(
      [
        order('1', latest, '2026-07-30T08:00:00.000Z'),
        order('2', frequent, '2026-07-29T08:00:00.000Z'),
        order('3', frequent, '2026-07-28T08:00:00.000Z'),
        order('4', latest, '2026-07-27T08:00:00.000Z', 'cancelled'),
      ],
      'passenger',
    );

    expect(history.items.map((item) => [item.address.id, item.tripCount])).toEqual([
      ['frequent', 2],
      ['latest', 1],
    ]);
    expect(history.lastDestination?.id).toBe('latest');
    expect(history.items.find((item) => item.address.id === 'latest')?.isLastDestination).toBe(true);
  });

  it('ignores another passenger and groups equivalent coordinates', () => {
    const samePlace = { ...frequent, id: 'renamed', label: 'Советская улица, 10' };
    const otherPassenger = { ...order('other', latest, '2026-07-31T08:00:00.000Z'), passengerId: 'other' };
    const history = buildDestinationHistory(
      [order('1', frequent, '2026-07-28T08:00:00.000Z'), order('2', samePlace, '2026-07-29T08:00:00.000Z'), otherPassenger],
      'passenger',
    );

    expect(history.items).toHaveLength(1);
    expect(history.items[0]?.tripCount).toBe(2);
    expect(history.items[0]?.address.label).toBe('Советская улица, 10');
  });
});
