import type { RowDataPacket } from 'mysql2/promise';

import type {
  Address,
  Coordinates,
  RideOrder,
  RideStatus,
  TariffCode,
} from '../src/domain/models';
import type { PricingScope } from '../src/domain/pricing';
import { extractHouseNumber } from '../src/domain/address-precision';

export type OrderRow = RowDataPacket & {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  tariff: TariffCode;
  status: RideStatus;
  pricing_scope: PricingScope;
  pickup_label: string;
  pickup_details: string | null;
  pickup_lat: number;
  pickup_lon: number;
  destination_label: string;
  destination_details: string | null;
  destination_lat: number;
  destination_lon: number;
  distance_meters: number;
  duration_seconds: number;
  route_geometry: unknown;
  base_price_minor: number;
  search_price_increase_minor: number;
  search_price_increase_interval_minutes: number;
  search_price_increase_step_minor: number;
  search_price_increase_last_slot: number;
  price_minor: number;
  commission_minor: number;
  commission_bps: number;
  waiting_seconds: number;
  waiting_price_minor: number;
  waiting_started_at: Date | string | null;
  waiting_free_minutes: number;
  waiting_per_minute_minor: number;
  payment_method: 'direct' | 'cash' | 'transfer';
  comment: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_rating_count?: number | null;
  rating?: number | null;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  passenger_rating?: number | null;
  passenger_rating_count?: number | null;
  passenger_score?: number | null;
  driver_score?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_color_hex?: string | null;
  plate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  passenger_latitude?: number | null;
  passenger_longitude?: number | null;
};

function routeCoordinates(value: unknown): Coordinates[] | undefined {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  const coordinates = parsed.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const candidate = point as Partial<Coordinates>;
    if (
      !Number.isFinite(candidate.latitude) ||
      !Number.isFinite(candidate.longitude) ||
      candidate.latitude! < -90 ||
      candidate.latitude! > 90 ||
      candidate.longitude! < -180 ||
      candidate.longitude! > 180
    ) {
      return [];
    }
    return [{ latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) }];
  });
  return coordinates.length >= 2 ? coordinates : undefined;
}

function address(
  id: string,
  label: string,
  details: string | null,
  latitude: number,
  longitude: number,
): Address {
  const normalizedDetails = details ?? undefined;
  return {
    id,
    label,
    details: normalizedDetails,
    houseNumber: extractHouseNumber({ label, details: normalizedDetails }) ?? undefined,
    coordinates: { latitude, longitude },
  };
}

export function presentOrder(row: OrderRow): RideOrder {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    driverId: row.driver_id ?? undefined,
    pickup: address('pickup', row.pickup_label, row.pickup_details, row.pickup_lat, row.pickup_lon),
    destination: address(
      'destination',
      row.destination_label,
      row.destination_details,
      row.destination_lat,
      row.destination_lon,
    ),
    tariff: row.tariff,
    status: row.status,
    pricingScope: row.pricing_scope,
    basePriceMinor: row.base_price_minor,
    searchPriceIncreaseMinor: row.search_price_increase_minor,
    searchPriceIncreaseIntervalMinutes: row.search_price_increase_interval_minutes,
    searchPriceIncreaseStepMinor: row.search_price_increase_step_minor,
    searchPriceIncreaseLastSlot: row.search_price_increase_last_slot,
    priceMinor: row.price_minor,
    serviceCommissionMinor: row.commission_minor,
    waitingSeconds: row.waiting_seconds,
    waitingPriceMinor: row.waiting_price_minor,
    waitingStartedAt: row.waiting_started_at
      ? new Date(row.waiting_started_at).toISOString()
      : undefined,
    waitingFreeMinutes: row.waiting_free_minutes,
    waitingPerMinuteMinor: row.waiting_per_minute_minor,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    routeCoordinates: routeCoordinates(row.route_geometry),
    paymentMethod: row.payment_method,
    comment: row.comment ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    driver:
      row.driver_id && row.driver_name
        ? {
            id: row.driver_id,
            name: row.driver_name,
            phone: row.driver_phone ?? '',
            rating: row.rating ?? 5,
            ratingCount: row.driver_rating_count ?? 0,
            vehicle: {
              make: row.vehicle_make ?? '',
              model: row.vehicle_model ?? '',
              color: row.vehicle_color ?? '',
              colorHex: row.vehicle_color_hex ?? '#777C84',
              plate: row.plate ?? '',
            },
            coordinates:
              row.latitude != null && row.longitude != null
                ? { latitude: row.latitude, longitude: row.longitude }
                : undefined,
          }
        : undefined,
    passenger: row.passenger_name
      ? {
          id: row.passenger_id,
          name: row.passenger_name,
          phone:
            row.driver_id && row.passenger_phone
              ? row.passenger_phone
              : undefined,
          rating: row.passenger_rating ?? 5,
          ratingCount: row.passenger_rating_count ?? 0,
        }
      : undefined,
    ratings:
      row.passenger_score != null || row.driver_score != null
        ? {
            byPassenger: row.passenger_score ?? undefined,
            byDriver: row.driver_score ?? undefined,
          }
        : undefined,
    passengerCoordinates:
      row.passenger_latitude != null && row.passenger_longitude != null
        ? {
            latitude: row.passenger_latitude,
            longitude: row.passenger_longitude,
          }
        : undefined,
  };
}

export type OrderRatingViewer = 'passenger' | 'driver' | 'admin';

export function limitOrderRatings(
  order: RideOrder,
  viewer: OrderRatingViewer,
): RideOrder {
  if (!order.ratings || viewer === 'admin') return order;

  const ownScore = viewer === 'passenger'
    ? order.ratings.byPassenger
    : order.ratings.byDriver;

  return {
    ...order,
    ratings: ownScore == null
      ? undefined
      : viewer === 'passenger'
        ? { byPassenger: ownScore }
        : { byDriver: ownScore },
  };
}

export const orderSelect = `
  SELECT o.*,
    u.name AS driver_name, u.phone AS driver_phone, d.rating,
    d.rating_count AS driver_rating_count,
    pu.name AS passenger_name, pu.phone AS passenger_phone,
    pu.rating AS passenger_rating,
    pu.rating_count AS passenger_rating_count,
    rr_passenger.score AS passenger_score, rr_driver.score AS driver_score,
    v.make AS vehicle_make, v.model AS vehicle_model, v.color AS vehicle_color,
    v.color_hex AS vehicle_color_hex, v.plate,
    dl.latitude, dl.longitude,
    pl.latitude AS passenger_latitude, pl.longitude AS passenger_longitude
  FROM orders o
  LEFT JOIN drivers d ON d.id = o.driver_id
  LEFT JOIN users u ON u.id = d.user_id
  JOIN users pu ON pu.id = o.passenger_id
  LEFT JOIN vehicles v ON v.id = o.vehicle_id
  LEFT JOIN driver_locations dl ON dl.driver_id = d.id
  LEFT JOIN passenger_locations pl ON pl.order_id = o.id
  LEFT JOIN ride_ratings rr_passenger
    ON rr_passenger.order_id = o.id AND rr_passenger.rater_role = 'passenger'
  LEFT JOIN ride_ratings rr_driver
    ON rr_driver.order_id = o.id AND rr_driver.rater_role = 'driver'
`;
