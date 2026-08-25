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
  classifyPricingScope,
  defaultPricingRules,
} from './pricing';

type DemoProgression = {
  next: RideStatus;
  delay: number;
};

const passengerProgression: Partial<Record<RideStatus, DemoProgression>> = {
  searching: { next: 'accepted', delay: 2_400 },
  accepted: { next: 'driver_arriving', delay: 2_800 },
  driver_arriving: { next: 'driver_waiting', delay: 3_200 },
  driver_waiting: { next: 'in_progress', delay: 3_500 },
  in_progress: { next: 'completed', delay: 4_000 },
};

const DEMO_DRIVER_LATITUDE_OFFSET = 0.0032;
const DEMO_DRIVER_LONGITUDE_OFFSET = 0.0048;

function directDistanceMeters(origin: Coordinates, destination: Coordinates): number {
  const latitudeDelta = (destination.latitude - origin.latitude) * Math.PI / 180;
  const longitudeDelta = (destination.longitude - origin.longitude) * Math.PI / 180;
  const latitude1 = origin.latitude * Math.PI / 180;
  const latitude2 = destination.latitude * Math.PI / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

export function buildDemoRoute(pickup: Address, destination: Address): RouteSummary {
  const distanceMeters = Math.max(
    800,
    Math.round(directDistanceMeters(pickup.coordinates, destination.coordinates) * 1.25),
  );
  return {
    distanceMeters,
    durationSeconds: Math.max(300, Math.round(distanceMeters / 8.3)),
    source: 'estimate',
    coordinates: [pickup.coordinates, destination.coordinates],
  };
}

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
): RoutePosition {
  const initial = ride.driver?.coordinates ?? ride.pickup.coordinates;
  if (ride.status === 'driver_arriving') {
    return routePositionAtProgress(
      [initial, ride.pickup.coordinates],
      progress,
    ) ?? fixedDriverPosition(initial);
  }
  if (ride.status === 'driver_waiting') {
    return fixedDriverPosition(ride.pickup.coordinates, initial);
  }
  if (ride.status === 'in_progress') {
    const route =
      ride.routeCoordinates?.length && ride.routeCoordinates.length >= 2
        ? ride.routeCoordinates
        : [ride.pickup.coordinates, ride.destination.coordinates];
    return routePositionAtProgress(route, progress) ??
      fixedDriverPosition(ride.pickup.coordinates);
  }
  if (ride.status === 'completed') {
    return fixedDriverPosition(
      ride.destination.coordinates,
      ride.routeCoordinates?.at(-2) ?? ride.pickup.coordinates,
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
  const tariff = buildTariffs(route.distanceMeters, pricingScope)[0]!;
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
