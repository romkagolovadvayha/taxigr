import { describe, expect, it } from 'vitest';

import {
  buildDemoDriverOffer,
  demoWaitingTransition,
  getDemoDriverSnapshot,
  getDemoPassengerProgression,
  placeDemoDriverNearPickup,
} from '../src/domain/demo-flow';
import type { RideOrder, RideStatus } from '../src/domain/models';
import { canTransitionRide } from '../src/domain/ride-state';
import { coordinatesDistanceMeters } from '../src/domain/route-tracking';

describe('demo passenger journey', () => {
  it('walks through every passenger-visible ride status in a valid order', () => {
    const visited: RideStatus[] = ['searching'];
    let current: RideStatus = 'searching';

    while (true) {
      const progression = getDemoPassengerProgression(current);
      if (!progression) break;
      expect(progression.delay).toBeGreaterThanOrEqual(2_000);
      expect(canTransitionRide(current, progression.next)).toBe(true);
      current = progression.next;
      visited.push(current);
    }

    expect(visited).toEqual([
      'searching',
      'driver_arriving',
      'driver_waiting',
      'in_progress',
      'completed',
    ]);
    expect(getDemoPassengerProgression('cancelled')).toBeNull();
    expect(getDemoPassengerProgression('completed')).toBeNull();
  });

  it('moves the demo car toward pickup and then along the trip route', () => {
    const baseRide = {
      id: 'demo-ride',
      passengerId: 'demo-passenger',
      pickup: {
        id: 'pickup',
        label: 'Pickup',
        coordinates: { latitude: 56, longitude: 52 },
      },
      destination: {
        id: 'destination',
        label: 'Destination',
        coordinates: { latitude: 55.98, longitude: 51.96 },
      },
      tariff: 'economy' as const,
      status: 'driver_arriving' as const,
      priceMinor: 70_000,
      serviceCommissionMinor: 8_400,
      distanceMeters: 3_000,
      durationSeconds: 300,
      routeCoordinates: [
        { latitude: 56, longitude: 52 },
        { latitude: 55.99, longitude: 51.98 },
        { latitude: 55.98, longitude: 51.96 },
      ],
      paymentMethod: 'cash' as const,
      createdAt: '2026-07-31T10:00:00.000Z',
      updatedAt: '2026-07-31T10:00:00.000Z',
      driver: {
        id: 'driver',
        name: 'Driver',
        phone: '',
        rating: 5,
        vehicle: {
          make: 'Lada',
          model: 'Granta',
          color: 'White',
          colorHex: '#fff',
          plate: 'A123BC',
        },
        coordinates: { latitude: 56.01, longitude: 52.01 },
      },
    };

    const approachRoute = [
      { latitude: 56.01, longitude: 52.01 },
      { latitude: 56, longitude: 52.01 },
      { latitude: 56, longitude: 52 },
    ];
    const arriving = getDemoDriverSnapshot(baseRide, 0.5, approachRoute);
    expect(arriving.coordinates.latitude).toBeGreaterThan(56);
    expect(arriving.coordinates.longitude).toBe(52.01);
    expect(arriving.heading).not.toBeNull();

    expect(getDemoDriverSnapshot(baseRide, 0.5).coordinates).toEqual(baseRide.driver.coordinates);
    expect(getDemoDriverSnapshot({ ...baseRide, status: 'in_progress', routeCoordinates: [] }, 0.5).coordinates)
      .toEqual(baseRide.pickup.coordinates);

    const inProgress = getDemoDriverSnapshot(
      { ...baseRide, status: 'in_progress' },
      0.5,
    );
    expect(inProgress.coordinates.latitude).toBeLessThan(56);
    expect(inProgress.coordinates.longitude).toBeLessThan(52);
    expect(inProgress.heading).not.toBeNull();
  });

  it('places the demo driver near the selected pickup anywhere in Russia', () => {
    const pickup = { latitude: 55.7558, longitude: 37.6176 };
    const driver = placeDemoDriverNearPickup(
      {
        id: 'driver',
        name: 'Driver',
        phone: '',
        rating: 5,
        vehicle: {
          make: 'Lada',
          model: 'Granta',
          color: 'White',
          colorHex: '#fff',
          plate: 'A123BC',
        },
        coordinates: { latitude: 56.049, longitude: 51.956 },
      },
      pickup,
    );

    expect(coordinatesDistanceMeters(driver.coordinates, pickup)).toBeLessThan(1_000);
    expect(coordinatesDistanceMeters(driver.coordinates, pickup)).toBeGreaterThan(100);
  });
});

describe('demo driver journey', () => {
  it('starts waiting on arrival and settles it only once when driving starts', () => {
    const now = Date.parse('2026-10-31T07:00:00Z');
    const current = { basePriceMinor: 15_000, priceMinor: 18_000, searchPriceIncreaseMinor: 3_000,
      waitingSeconds: 0, waitingFreeMinutes: 3, waitingPerMinuteMinor: 200 } as RideOrder;
    const waiting = { ...current, ...demoWaitingTransition(current, 'driver_waiting', now) };
    expect(waiting.waitingStartedAt).toBe(new Date(now).toISOString());
    expect(demoWaitingTransition(waiting, 'driver_waiting', now + 60_000).waitingStartedAt).toBe(waiting.waitingStartedAt);
    expect(demoWaitingTransition(waiting, 'in_progress', now + 120_000).waitingPriceMinor).toBe(0);
    const driving = { ...waiting, ...demoWaitingTransition(waiting, 'in_progress', now + 270_000) };
    expect(driving).toMatchObject({ waitingStartedAt: undefined, waitingSeconds: 270, waitingPriceMinor: 400, priceMinor: 18_400 });
    expect(demoWaitingTransition(driving, 'in_progress', now + 600_000)).toEqual({});
    expect(demoWaitingTransition(driving, 'completed', now + 900_000)).toEqual({});
  });

  it('creates a road-based offer that the driver can accept', () => {
    const offer = buildDemoDriverOffer(
      {
        pickup: {
          id: 'pickup',
          label: 'с. Грахово, ул. Ачинцева, 5',
          houseNumber: '5',
          coordinates: { latitude: 56.0477, longitude: 51.9586 },
        },
        destination: {
          id: 'destination',
          label: 'д. Благодатное, ул. Благодатновская, 53А',
          houseNumber: '53А',
          coordinates: { latitude: 55.9995786, longitude: 51.8684492 },
        },
        passenger: {
          id: 'demo-passenger',
          name: 'Дмитрий',
          rating: 4.89,
          ratingCount: 18,
        },
        route: {
        distanceMeters: 9_500,
        durationSeconds: 1_020,
        source: 'osrm',
        coordinates: [
          { latitude: 56.0477, longitude: 51.9586 },
          { latitude: 55.9995786, longitude: 51.8684492 },
        ],
        },
      },
      new Date('2026-07-30T10:00:00.000Z'),
    );

    expect(offer.id).toBe('driver-offer-1785405600000');
    expect(offer.status).toBe('searching');
    expect(offer.passenger?.rating).toBeGreaterThan(0);
    expect(offer.pickup.houseNumber).toBeTruthy();
    expect(offer.destination.houseNumber).toBeTruthy();
    expect(offer.routeCoordinates).toHaveLength(2);
    expect(canTransitionRide(offer.status, 'accepted')).toBe(true);
  });
});
