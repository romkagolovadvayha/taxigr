import { describe, expect, it } from 'vitest';

import type { RideOrder } from '../src/domain/models';
import { driverOrderAvailablePush, passengerRidePush } from '../server/ride-push';

const ride: RideOrder = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  passengerId: 'passenger-1',
  driverId: 'driver-1',
  pickup: {
    id: 'pickup',
    label: 'Караоке-кафе «Максимум», ул. Дорожная, 13',
    coordinates: { latitude: 56.05, longitude: 52.99 },
  },
  destination: {
    id: 'destination',
    label: 'ул. Колпакова, 1Б',
    coordinates: { latitude: 56.06, longitude: 53 },
  },
  tariff: 'economy',
  status: 'accepted',
  priceMinor: 15_000,
  serviceCommissionMinor: 1_500,
  distanceMeters: 2_000,
  durationSeconds: 300,
  paymentMethod: 'cash',
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:01:00.000Z',
  driver: {
    id: 'driver-1',
    name: 'Алексей',
    phone: '+79128568088',
    rating: 5,
    vehicle: {
      make: 'Skoda',
      model: 'Rapid',
      color: 'Чёрная',
      colorHex: '#000000',
      plate: 'О564НО18',
    },
  },
};

describe('ride push copy', () => {
  it('uses only the plate and short status when a driver is found', () => {
    expect(passengerRidePush(ride)).toMatchObject({
      title: 'Найден водитель',
      body: 'Номер авто О564НО18 едет к вам',
      channelId: 'ride-taxi-found-v2',
    });
  });

  it('does not leak names, phones, route, price, make, or color in status pushes', () => {
    const statuses: RideOrder['status'][] = [
      'accepted',
      'driver_arriving',
      'driver_waiting',
      'in_progress',
      'completed',
      'cancelled',
    ];
    for (const status of statuses) {
      const push = passengerRidePush({ ...ride, status });
      const visible = `${push?.title} ${push?.body}`;
      expect(visible).not.toContain('Алексей');
      expect(visible).not.toContain('+79128568088');
      expect(visible).not.toContain('Дорожная');
      expect(visible).not.toContain('Колпакова');
      expect(visible).not.toContain('150');
      expect(visible).not.toContain('Skoda');
      expect(visible).not.toContain('Чёрная');
    }
  });

  it('keeps driver offer pushes free of route and price details', () => {
    expect(driverOrderAvailablePush(ride.id)).toMatchObject({
      title: 'Новый заказ',
      body: 'Откройте приложение, чтобы посмотреть детали',
    });
  });
});
