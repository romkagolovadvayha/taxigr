import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import appConfig from '../app.json';

import type { RideOrder } from '../src/domain/models';
import { driverOrderAvailablePush, passengerRidePush, driverRideCancelledPush, passengerDriverReleasedPush } from '../server/ride-push';

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
      body: 'Примите или отклоните заказ в приложении',
    });
  });

  it('explains when the driver accepted the order as the next ride', () => {
    expect(passengerRidePush({ ...ride, driverQueuePosition: 2 })).toMatchObject({
      title: 'Водитель принял заказ заранее',
      body: expect.stringContaining('завершает предыдущую поездку'),
    });
  });

  it('pairs each spoken status with the corresponding Android channel', () => {
    expect(passengerRidePush({ ...ride, status: 'driver_arriving' })).toMatchObject({
      sound: 'driver_arriving.wav', channelId: 'ride-driver-arriving-voice-v1',
    });
    expect(driverOrderAvailablePush(ride.id, true)).toMatchObject({
      sound: 'order_updated.wav', channelId: 'driver-order-updated-voice-v1',
      body: 'Пассажир повысил стоимость поездки. Примите или отклоните заказ.',
    });
    // A queued driver has been found, but is not yet driving to this passenger.
    expect(passengerRidePush({ ...ride, driverQueuePosition: 2 })?.sound).toBe('taxi_found_queued.wav');
  });

  it.each(['cash', 'transfer'] as const)('matches completion speech to %s payment', (paymentMethod) => {
    expect(passengerRidePush({ ...ride, status: 'completed', paymentMethod })).toMatchObject({
      sound: `ride_complete_${paymentMethod}.wav`, channelId: `ride-complete-${paymentMethod}-voice-v1`,
    });
  });

  it('distinguishes passenger cancellation, administrator cancellation and renewed search', () => {
    expect(driverRideCancelledPush({ ...ride, status: 'cancelled', cancellationCode: 'passenger' }).sound).toBe('passenger_cancelled.wav');
    expect(driverRideCancelledPush({ ...ride, status: 'cancelled', cancellationCode: 'admin' }).sound).toBe('admin_cancelled.wav');
    expect(passengerRidePush({ ...ride, status: 'cancelled', cancellationCode: 'search_timeout' })?.sound).toBe('search_timeout.wav');
    expect(passengerDriverReleasedPush({ ...ride, status: 'searching' }).sound).toBe('driver_released.wav');
  });

  it('bundles and registers every sound sent by ride notifications', () => {
    const plugin = appConfig.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications') as unknown as [string, { sounds: string[] }];
    const registrations = readFileSync('src/notifications/push-registration.native.ts', 'utf8');
    const messages = [
      passengerRidePush(ride), passengerRidePush({ ...ride, driverQueuePosition: 2 }),
      ...(['cash', 'transfer', 'direct'] as const).map(paymentMethod => passengerRidePush({ ...ride, status: 'completed', paymentMethod })),
      ...(['passenger', 'admin', 'search_timeout'] as const).flatMap(cancellationCode => [passengerRidePush({ ...ride, status: 'cancelled', cancellationCode }), driverRideCancelledPush({ ...ride, status: 'cancelled', cancellationCode })]),
      passengerDriverReleasedPush(ride), driverOrderAvailablePush(ride.id), driverOrderAvailablePush(ride.id, true),
    ];
    for (const message of messages) {
      expect(plugin[1].sounds).toContain(`./assets/sounds/${message?.sound}`);
      expect(registrations).toContain(`'${message?.channelId}'`);
    }
  });
});
