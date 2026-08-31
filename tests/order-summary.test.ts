import { describe, expect, it } from 'vitest';

import {
  orderSummarySelect,
  presentOrder,
  presentOrderSummary,
  type OrderRow,
} from '../server/presenters';

function orderRow(): OrderRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    passenger_id: '00000000-0000-4000-8000-000000000002',
    driver_id: null,
    active_driver_id: null,
    tariff: 'economy',
    status: 'completed',
    pricing_scope: 'district',
    priority_release_at: null,
    priority_released_at: null,
    pickup_label: 'с. Грахово, ул. Советская, 1',
    pickup_details: null,
    pickup_lat: 56.0477,
    pickup_lon: 51.9586,
    destination_label: 'с. Грахово, ул. Ачинцева, 5',
    destination_details: null,
    destination_lat: 56.052,
    destination_lon: 51.966,
    destinations_json: null,
    distance_meters: 4_200,
    duration_seconds: 720,
    route_geometry: Array.from({ length: 600 }, (_, index) => ({
      latitude: 56.0477 + index / 100_000,
      longitude: 51.9586 + index / 100_000,
    })),
    base_price_minor: 25_000,
    search_price_increase_minor: 0,
    search_price_increase_interval_minutes: 4,
    search_price_increase_step_minor: 5_000,
    search_price_increase_last_slot: 0,
    price_minor: 25_000,
    commission_minor: 3_000,
    commission_bps: 1_200,
    waiting_seconds: 0,
    waiting_price_minor: 0,
    waiting_started_at: null,
    waiting_free_minutes: 3,
    waiting_per_minute_minor: 500,
    payment_method: 'cash',
    payment_confirmed_at: null,
    comment: null,
    cancellation_code: null,
    cancellation_reason: null,
    created_at: new Date('2026-08-31T08:00:00.000Z'),
    updated_at: new Date('2026-08-31T08:15:00.000Z'),
  } as OrderRow;
}

describe('order summary payload', () => {
  it('keeps list fields and excludes route geometry and joined profiles', () => {
    const row = orderRow();
    const summary = presentOrderSummary(row);

    expect(summary).toEqual({
      id: row.id,
      passengerId: row.passenger_id,
      pickup: expect.objectContaining({ label: row.pickup_label }),
      destination: expect.objectContaining({ label: row.destination_label }),
      tariff: row.tariff,
      status: row.status,
      priceMinor: row.price_minor,
      createdAt: '2026-08-31T08:00:00.000Z',
      updatedAt: '2026-08-31T08:15:00.000Z',
    });
    expect(summary).not.toHaveProperty('routeCoordinates');
    expect(summary).not.toHaveProperty('driver');
    expect(summary).not.toHaveProperty('passenger');
    expect(orderSummarySelect).not.toContain('route_geometry');
    expect(orderSummarySelect).not.toContain('JOIN');
  });

  it('is dramatically smaller than a detailed order with a route', () => {
    const row = orderRow();
    const detailBytes = Buffer.byteLength(JSON.stringify(presentOrder(row)));
    const summaryBytes = Buffer.byteLength(JSON.stringify(presentOrderSummary(row)));

    expect(summaryBytes).toBeLessThan(detailBytes / 20);
  });
});
