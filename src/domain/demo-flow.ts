import type {
  Address,
  Coordinates,
  DriverSummary,
  PassengerSummary,
  RideOrder,
  RideStatus,
  RouteSummary,
} from './models';
import {
  headingBetweenCoordinates,
  routePositionAtProgress,
  type RoutePosition,
} from './route-tracking';
import {
  buildTariffs,
  calculateCommissionMinor,
  calculateWaitingChargeMinor,
  classifyPricingScope,
  defaultPricingRules,
  fareRoundingMinor,
  fareRoundingMode,
  roundFareMinor,
} from './pricing';
import { rideWaitingSeconds } from './waiting';

export function demoWaitingTransition(ride: RideOrder, status: RideStatus, now = Date.now()): Partial<RideOrder> {
  if (status === 'driver_waiting') {
    return { waitingStartedAt: ride.waitingStartedAt ?? new Date(now).toISOString() };
  }
  if ((status === 'in_progress' || status === 'completed') && ride.waitingStartedAt) {
    const waitingSeconds = rideWaitingSeconds(ride, now);
    const waitingPriceMinor = calculateWaitingChargeMinor(waitingSeconds, ride.waitingFreeMinutes, ride.waitingPerMinuteMinor, ride.fareRoundingMinor, ride.fareRoundingMode ?? 'up');
    const priceMinor = (ride.basePriceMinor ?? ride.priceMinor - (ride.waitingPriceMinor ?? 0) - (ride.searchPriceIncreaseMinor ?? 0)) +
      (ride.searchPriceIncreaseMinor ?? 0) + waitingPriceMinor;
    return { waitingSeconds, waitingPriceMinor, waitingStartedAt: undefined, priceMinor,
      serviceCommissionMinor: calculateCommissionMinor(priceMinor) };
  }
  return {};
}

type DemoProgression = {
  next: RideStatus;
  delay: number;
};

const passengerProgression: Partial<Record<RideStatus, DemoProgression>> = {
  searching: { next: 'driver_arriving', delay: 2_400 },
  accepted: { next: 'driver_waiting', delay: 2_800 },
  driver_arriving: { next: 'driver_waiting', delay: 3_200 },
  driver_waiting: { next: 'in_progress', delay: 3_500 },
  in_progress: { next: 'completed', delay: 4_000 },
};

const DEMO_DRIVER_LATITUDE_OFFSET = 0.0032;
const DEMO_DRIVER_LONGITUDE_OFFSET = 0.0048;

function offsetInsideRange(value: number, offset: number, limit: number): number {
  return value + offset <= limit ? value + offset : value - offset;
}

export function placeDemoDriverNearPickup(
  driver: DriverSummary,
  pickup: Coordinates,
): DriverSummary & { coordinates: Coordinates } {
  return {
    ...driver,
    coordinates: {
      latitude: offsetInsideRange(pickup.latitude, DEMO_DRIVER_LATITUDE_OFFSET, 90),
      longitude: offsetInsideRange(pickup.longitude, DEMO_DRIVER_LONGITUDE_OFFSET, 180),
    },
  };
}

export function getDemoPassengerProgression(status: RideStatus): DemoProgression | null {
  return passengerProgression[status] ?? null;
}

function fixedDriverPosition(
  coordinates: Coordinates,
  from?: Coordinates,
): RoutePosition {
  return {
    coordinates,
    heading: from ? headingBetweenCoordinates(from, coordinates) : null,
  };
}

export function getDemoDriverSnapshot(
  ride: RideOrder,
  progress: number,
  approachRoute: Coordinates[] = [],
): RoutePosition {
  const initial = approachRoute[0] ?? ride.driver?.coordinates ?? ride.pickup.coordinates;
  const pickup = ride.routeCoordinates?.[0] ?? ride.pickup.coordinates;
  if (ride.status === 'driver_arriving') {
    return routePositionAtProgress(
      approachRoute,
      progress,
    ) ?? fixedDriverPosition(initial);
  }
  if (ride.status === 'driver_waiting') {
    return fixedDriverPosition(pickup, initial);
  }
  if (ride.status === 'in_progress') {
    return routePositionAtProgress(ride.routeCoordinates ?? [], progress) ??
      fixedDriverPosition(pickup);
  }
  if (ride.status === 'completed') {
    return fixedDriverPosition(
      ride.routeCoordinates?.[ride.routeCoordinates.length - 1] ?? ride.destination.coordinates,
      ride.routeCoordinates?.[ride.routeCoordinates.length - 2] ?? ride.pickup.coordinates,
    );
  }
  return fixedDriverPosition(initial);
}

export function buildDemoDriverOffer(
  {
    route,
    pickup,
    destination,
    passenger,
  }: {
    route: RouteSummary;
    pickup: Address;
    destination: Address;
    passenger: PassengerSummary;
  },
  now = new Date(),
): RideOrder {
  const pricingScope = classifyPricingScope(pickup, destination);
  const tariff = buildTariffs(route.distanceMeters, pricingScope, defaultPricingRules, now, [pickup, destination])[0]!;
  const timestamp = now.toISOString();

  return {
    id: `driver-offer-${now.getTime()}`,
    passengerId: passenger.id,
    pickup,
    destination,
    tariff: tariff.code,
    status: 'searching',
    pricingScope,
    basePriceMinor: tariff.priceMinor,
    fareRoundingMinor,
    fareRoundingMode,
    searchPriceIncreaseStepMinor: roundFareMinor(defaultPricingRules.searchPriceIncreaseStepMinor),
    priceMinor: tariff.priceMinor,
    serviceCommissionMinor: calculateCommissionMinor(tariff.priceMinor),
    waitingSeconds: 0,
    waitingPriceMinor: 0,
    waitingFreeMinutes: defaultPricingRules.waitingFreeMinutes,
    waitingPerMinuteMinor: defaultPricingRules.waitingPerMinuteMinor,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    routeCoordinates: route.coordinates,
    paymentMethod: 'cash',
    comment: 'Жду у входа в МФЦ',
    createdAt: timestamp,
    updatedAt: timestamp,
    passenger,
  };
}
