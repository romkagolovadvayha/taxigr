import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RideOrder } from '../src/domain/models';
import { formatPersonalMessengerNotification } from '../server/messenger-notifications';
import { limitOrderRatings } from '../server/presenters';
import {
  driverRideNotification,
  driverRideButtons,
  parseRideMessengerActionData,
  passengerRideNotification,
  rideMessengerActionData,
} from '../server/ride-messenger';

const orderId = '123e4567-e89b-12d3-a456-426614174000';

it('labels the child tariff clearly and keeps the accept action for all drivers', () => {
  const notification=driverRideNotification(ride({tariff:'child'}));
  const text=formatPersonalMessengerNotification(notification);
  expect(text).toContain('Детский');
  expect(text).toContain('поездка с ребёнком');
  expect(text).toContain('вести аккуратно');
  expect(text).not.toContain('кресло');
  expect(JSON.stringify(notification.buttons)).toContain(rideMessengerActionData(orderId,'accept'));
});

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
  it('includes an HTTPS navigation button in the shared driver message for Telegram, MAX and VK', () => {
    const pickupRide = ride({ status: 'accepted', driverId: 'driver-1' });
    const button = driverRideButtons(pickupRide).flat().find(item => item.label === '🧭 Маршрут');
    expect(button?.type).toBe('link');
    if (button?.type !== 'link') throw new Error('Navigation button missing');
    const url = new URL(button.url);
    expect(url.pathname).toBe('/navigate');
    expect(url.searchParams.get('lat')).toBe(String(pickupRide.pickup.coordinates.latitude));
    expect(url.searchParams.get('address')).toBe(pickupRide.pickup.label);
    const active = ride({ status: 'in_progress', driverId: 'driver-1', destinations: [pickupRide.pickup, pickupRide.destination], nextDestinationIndex: 1 });
    const nextButton = driverRideButtons(active).flat().find(item => item.label === '🧭 Маршрут');
    if (nextButton?.type !== 'link') throw new Error('Next stop navigation missing');
    expect(new URL(nextButton.url).searchParams.get('address')).toBe(active.destination.label);
  });
  it.each(['searching', 'completed', 'cancelled'] as const)('does not show a driver navigation action for %s', status => {
    expect(driverRideButtons(ride({ status })).flat().some(item => item.label === '🧭 Маршрут')).toBe(false);
  });
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
      expect.objectContaining({ label: '📍 Я приехал', intent: 'positive' }),
    ]));
    expect(inProgress.buttons?.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '🏁 Завершить поездку', intent: 'positive' }),
    ]));
    expect(completed.buttons?.[0]).toHaveLength(5);
  });

  it.each(['accepted', 'driver_arriving'] as const)('goes directly to arrival from %s without a departure action', status => {
    const buttons = driverRideButtons(ride({ status, driverId: 'driver-1' })).flat();
    expect(buttons[0]).toMatchObject({ label: '📍 Я приехал', data: `r:here:${orderId}` });
    expect(buttons.some(button => button.type === 'callback' && button.data === `r:go:${orderId}`)).toBe(false);
  });

  it.each(['driver_waiting', 'in_progress'] as const)('uses automatic waiting without manual timer buttons during %s', status => {
    const buttons = driverRideButtons(ride({ status, driverId: 'driver-1', waitingStartedAt: '2026-08-25T10:00:00.000Z' })).flat();
    expect(buttons.some(button => button.type === 'callback' && /r:wait-(on|off):/.test(button.data))).toBe(false);
  });

  it.each(['accepted', 'driver_arriving', 'driver_waiting', 'in_progress'] as const)(
    'offers calling and the shared order chat to both participants while %s', status => {
      const assigned = ride({ status, driverId: 'driver-1', driver: assignedDriver });
      for (const [notification, recipient] of [
        [passengerRideNotification(assigned), 'водителю'],
        [driverRideNotification(assigned), 'пассажиру'],
      ] as const) {
        expect(notification.buttons?.flat()).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'callback', label: `📞 Позвонить ${recipient}`, data: `r:contact:${orderId}` }),
          expect.objectContaining({ type: 'link', label: `💬 Написать ${recipient}`, url: expect.stringContaining(`/chat/${orderId}`) }),
        ]));
      }
    },
  );

  it.each(['searching', 'completed', 'cancelled'] as const)('does not offer contacts while %s', status => {
    const closed = ride({ status, driverId: 'driver-1', driver: assignedDriver });
    for (const notification of [passengerRideNotification(closed), driverRideNotification(closed)]) {
      expect(notification.buttons?.flat().some(button => /Позвонить|Написать/.test(button.label))).toBe(false);
    }
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
