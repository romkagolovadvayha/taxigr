import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RideOrder } from '../src/domain/models';
import { formatPersonalMessengerNotification } from '../server/messenger-notifications';
import { limitOrderRatings } from '../server/presenters';
import {
  driverRideNotification,
  parseRideMessengerActionData,
  passengerRideNotification,
  rideMessengerActionData,
} from '../server/ride-messenger';

const orderId = '123e4567-e89b-12d3-a456-426614174000';

function ride(overrides: Partial<RideOrder> = {}): RideOrder {
  return {
    id: orderId,
    passengerId: 'passenger-1',
    pickup: {
      id: 'pickup',
      label: 'с. Грахово, ул. Юбилейная, 5',
      coordinates: { latitude: 56.0501, longitude: 52.9951 },
    },
    destination: {
      id: 'destination',
      label: 'с. Грахово, ул. Ачинцева, 2а',
      coordinates: { latitude: 56.054, longitude: 52.999 },
    },
    tariff: 'economy',
    status: 'searching',
    priceMinor: 15_000,
    serviceCommissionMinor: 1_500,
    distanceMeters: 2_000,
    durationSeconds: 300,
    paymentMethod: 'cash',
    createdAt: '2026-08-25T09:58:34.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    searchPriceIncreaseIntervalMinutes: 4,
    searchPriceIncreaseStepMinor: 3_000,
    passenger: {
      id: 'passenger-1',
      name: 'Иван Петров',
      phone: '+7 999 111-22-33',
      rating: 5,
      ratingCount: 2,
    },
    ...overrides,
  };
}

const assignedDriver: NonNullable<RideOrder['driver']> = {
  id: 'driver-1',
  name: 'Пётр Водителев',
  phone: '+7 999 444-55-66',
  rating: 4.9,
  vehicle: {
    make: 'Lada Vesta',
    model: 'Vesta',
    color: 'Белый',
    colorHex: '#FFFFFF',
    plate: 'А123ВС18',
  },
  coordinates: { latitude: 56.051, longitude: 52.996 },
};

describe('ride messenger flow', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps callback payloads valid and below the Telegram 64-byte limit', () => {
    const data = rideMessengerActionData(orderId, 'complete-confirm');

    expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
    expect(parseRideMessengerActionData(data)).toEqual({
      orderId,
      action: 'complete-confirm',
    });
    expect(parseRideMessengerActionData('r:a:not-an-order')).toBeNull();
  });

  it('shows search duration and accept action without leaking passenger contacts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T10:00:00.000Z'));
    const notification = driverRideNotification(ride());
    const text = formatPersonalMessengerNotification(notification);

    expect(notification.title).toContain('01:26');
    expect(text).not.toContain('Иван Петров');
    expect(text).not.toContain('+7 999 111-22-33');
    expect(notification.buttons?.[0]?.[0]).toMatchObject({
      type: 'callback',
      label: '✅ Принять заказ',
      intent: 'positive',
    });
    expect(notification.locations?.[0]).toMatchObject({
      title: 'Место подачи',
      latitude: 56.0501,
      longitude: 52.9951,
    });
  });

  it('reveals names and phones only to participants after assignment', () => {
    const assigned = ride({
      status: 'accepted',
      driverId: 'driver-1',
      driver: assignedDriver,
    });
    const passengerText = formatPersonalMessengerNotification(
      passengerRideNotification(assigned),
    );
    const driverText = formatPersonalMessengerNotification(
      driverRideNotification(assigned),
    );

    expect(passengerText).toContain('Пётр Водителев');
    expect(passengerText).toContain('+7 999 444-55-66');
    expect(driverText).toContain('Иван Петров');
    expect(driverText).toContain('+7 999 111-22-33');
    expect(passengerRideNotification(assigned).locations?.[0]).toMatchObject({
      title: 'Водитель сейчас',
      latitude: 56.051,
      longitude: 52.996,
    });
  });

  it('provides every driver transition and passenger post-order rating', () => {
    const arriving = driverRideNotification(ride({
      status: 'driver_arriving',
      driverId: 'driver-1',
      driver: assignedDriver,
    }));
    const inProgress = driverRideNotification(ride({
      status: 'in_progress',
      driverId: 'driver-1',
      driver: assignedDriver,
    }));
    const completed = passengerRideNotification(ride({
      status: 'completed',
      driverId: 'driver-1',
      driver: assignedDriver,
    }));

    expect(arriving.buttons?.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '📍 Я на месте', intent: 'positive' }),
    ]));
    expect(inProgress.buttons?.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '🏁 Завершить поездку', intent: 'positive' }),
    ]));
    expect(completed.buttons?.[0]).toHaveLength(5);
  });

  it('does not offer navigation or a status transition for the queued order', () => {
    const queued = ride({
      status: 'accepted',
      driverId: 'driver-1',
      driverQueuePosition: 2,
      driver: assignedDriver,
    });
    const driverNotification = driverRideNotification(queued);
    const passengerNotification = passengerRideNotification(queued);

    expect(driverNotification.title).toBe('Следующий заказ принят');
    expect(driverNotification.locations).toEqual([]);
    expect(driverNotification.buttons?.flat()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '🚗 Выехал к пассажиру' }),
    ]));
    expect(passengerNotification.title).toBe('Водитель завершает предыдущий заказ');
    expect(passengerNotification.locations).toEqual([]);
  });

  it('only exposes the rating submitted by the current participant', () => {
    const completed = ride({
      status: 'completed',
      driverId: 'driver-1',
      driver: assignedDriver,
      ratings: { byPassenger: 5, byDriver: 2 },
    });

    expect(limitOrderRatings(completed, 'passenger').ratings).toEqual({ byPassenger: 5 });
    expect(limitOrderRatings(completed, 'driver').ratings).toEqual({ byDriver: 2 });
    expect(limitOrderRatings(completed, 'admin').ratings).toEqual({
      byPassenger: 5,
      byDriver: 2,
    });
  });
});
