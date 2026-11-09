import { randomUUID } from 'node:crypto';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signSession } from '../server/security';
import type { DestinationHistoryItem } from '../src/domain/address-history';
import type { Address, RideOrder, Tariff, UserRole } from '../src/domain/models';
import { confirmAddressPoint } from '../src/domain/route-stops';
import { currentInitialLegalAcceptance } from '../src/legal/documents';

const enabled = process.env.RUN_API_INTEGRATION === '1';
const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:4110';
const databaseUrl = process.env.MYSQL_URL ?? '';
const pickup = confirmAddressPoint({ id: 'preorder-pickup', label: 'с. Грахово, ул. Ачинцева, 5', houseNumber: '5', coordinates: { latitude: 56.04758, longitude: 51.95842 } }, { latitude: 56.04758, longitude: 51.95842 });
const destination = confirmAddressPoint({ id: 'preorder-destination', label: 'с. Грахово, ул. Колпакова, 1Б', houseNumber: '1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } }, { latitude: 56.04576, longitude: 51.96165 });
type Actor = { id: string; token: string; driverId?: string };
type Bootstrap = { activePassengerOrder: RideOrder | null; driverQueue: { current: RideOrder | null; next: RideOrder | null; offer: RideOrder | null };
  driverPreorders: RideOrder[]; addressHistory: DestinationHistoryItem[]; firstRideSuggestions: Address[] };
let connection: Connection;
let previousBooking: number;
let previousDelay: number;
const actors: Actor[] = [];
const [passenger, instantPassenger, expiryPassenger, first, second] = Array.from({ length: 5 }, () => ({ id: randomUUID(), token: '' } as Actor)) as [Actor, Actor, Actor, Actor, Actor];

async function api<T>(actor: Actor, endpoint: string, body?: object) {
  const response = await fetch(apiUrl + endpoint, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, ...await response.json() as { data: T; error?: { code: string; message: string } } };
}

async function seedActor(actor: Actor, index: number, role: UserRole, status = 'online') {
  actors.push(actor);
  await connection.execute(`INSERT INTO users (id,name,phone,phone_verified_at,gender,profile_completed_at)
    VALUES (?, 'Scheduled order QA', ?, UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3))`, [actor.id, `+7909092970${index}`]);
  await connection.execute('INSERT INTO user_roles (user_id,role) VALUES (?,?)', [actor.id, role]);
  if (role === 'driver') {
    actor.driverId = randomUUID();
    await connection.execute('INSERT INTO drivers (id,user_id,status,has_child_seat) VALUES (?,?,?,TRUE)', [actor.driverId, actor.id, status]);
    await connection.execute(`INSERT INTO vehicles (id,driver_id,make,model,year,color,color_hex,plate)
      VALUES (?,?,'Lada','Granta',2024,'Жёлтая','#F6C945',?)`, [randomUUID(), actor.driverId, `PREQA${index}`]);
  }
  actor.token = await signSession({ id: actor.id, roles: [role] });
}

const quote = (actor: Actor, scheduledAt?: string) => api<{ quoteToken: string; tariffs: Tariff[] }>(actor, '/v1/quotes', { pickup, destination, scheduledAt });
const bootstrap = (actor: Actor) => api<Bootstrap>(actor, '/v1/bootstrap');
const accept = (driver: Actor, id: string, confirmedScheduledAt?: string) => api<RideOrder>(driver, `/v1/driver/orders/${id}/accept`, { confirmedScheduledAt });
const transition = (driver: Actor, id: string, status: RideOrder['status']) => api<RideOrder>(driver, `/v1/driver/orders/${id}/transition`, { status });
const orderPayload = (actor: Actor, quoteToken: string, scheduledAt?: string) => ({
  pickup, destination, quoteToken, tariff: 'economy', scheduledAt,
  idempotencyKey: `preorder-qa-${randomUUID()}`, deviceId: `preorder-qa-device-${actor.id}`,
  legalAcceptance: currentInitialLegalAcceptance(),
});

describe.runIf(enabled)('scheduled orders against an isolated API database', () => {
  beforeAll(async () => {
    const database = new URL(databaseUrl);
    if (!['127.0.0.1', 'localhost'].includes(database.hostname) || !/^\/taxi_(qa|test)_/.test(database.pathname) ||
        !['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) throw new Error('An isolated local QA database is required');
    connection = await mysql.createConnection({ uri: databaseUrl, timezone: 'Z' });
    const [booking] = await connection.query<RowDataPacket[]>('SELECT enabled FROM booking_settings WHERE id=1');
    previousBooking = Number(booking[0]?.enabled ?? 0);
    await connection.execute('UPDATE booking_settings SET enabled=1 WHERE id=1');
    const [dispatch] = await connection.query<RowDataPacket[]>("SELECT delay_minutes FROM driver_dispatch_settings WHERE scope='grahovo'");
    previousDelay = Number(dispatch[0]?.delay_minutes ?? 0);
    await connection.execute("UPDATE driver_dispatch_settings SET delay_minutes=5 WHERE scope='grahovo'");
    await seedActor(passenger, 1, 'passenger');
    await seedActor(instantPassenger, 2, 'passenger');
    await seedActor(expiryPassenger, 3, 'passenger');
    await seedActor(first, 4, 'driver');
    await seedActor(second, 5, 'driver', 'offline');
    await connection.execute("INSERT INTO driver_priority_assignments (driver_id,scope) VALUES (?, 'grahovo')", [first.driverId!]);
  }, 30_000);

  afterAll(async () => {
    if (!connection) return;
    if (actors.length) {
      const userIds = actors.map(actor => actor.id);
      await connection.query('DELETE FROM orders WHERE passenger_id IN (?)', [userIds]);
      await connection.query('DELETE FROM drivers WHERE user_id IN (?)', [userIds]);
      await connection.query('DELETE FROM users WHERE id IN (?)', [userIds]);
    }
    await connection.execute('UPDATE booking_settings SET enabled=? WHERE id=1', [previousBooking]);
    await connection.execute("UPDATE driver_dispatch_settings SET delay_minutes=? WHERE scope='grahovo'", [previousDelay]);
    await connection.end();
  });

  it('validates dates and binds the future fare to the quoted pickup time', async () => {
    expect((await quote(passenger, new Date(Date.now() - 60_000).toISOString())).error?.code).toBe('INVALID_SCHEDULED_PICKUP');
    expect((await quote(passenger, new Date(Date.now() + 31 * 86_400_000).toISOString())).error?.code).toBe('INVALID_SCHEDULED_PICKUP');
    const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const daytime = `${day}T08:00:00.000Z`;
    const nighttime = `${day}T22:00:00.000Z`;
    const [rows] = await connection.query<RowDataPacket[]>('SELECT grahovo_fare_07_22_minor, grahovo_fare_02_07_minor FROM tariff_settings WHERE id=1');
    const previous = rows[0]!;
    await connection.execute('UPDATE tariff_settings SET grahovo_fare_07_22_minor=20000, grahovo_fare_02_07_minor=40000 WHERE id=1');
    try {
      const [dayQuote, nightQuote] = await Promise.all([quote(passenger, daytime), quote(passenger, nighttime)]);
      expect(dayQuote.status).toBe(200);
      expect(nightQuote.status).toBe(200);
      expect(nightQuote.data.tariffs[0]!.priceMinor).toBeGreaterThan(dayQuote.data.tariffs[0]!.priceMinor);
      const tampered = await api(passenger, '/v1/orders', orderPayload(passenger, dayQuote.data.quoteToken, nighttime));
      expect(tampered.error?.code).toBe('QUOTE_SCHEDULE_MISMATCH');
    } finally {
      await connection.execute('UPDATE tariff_settings SET grahovo_fare_07_22_minor=?, grahovo_fare_02_07_minor=? WHERE id=1', [previous.grahovo_fare_07_22_minor, previous.grahovo_fare_02_07_minor]);
    }
  });

  it('shows a preorder to priority and off-shift drivers, takes it once, and keeps the live queue independent', async () => {
    const scheduledAt = new Date(Math.ceil((Date.now() + 86_400_000) / 60_000) * 60_000).toISOString();
    const calculated = await quote(passenger, scheduledAt);
    const payload = orderPayload(passenger, calculated.data.quoteToken, scheduledAt);
    const created = await api<RideOrder>(passenger, '/v1/orders', payload);
    expect(created.status, JSON.stringify(created.error)).toBe(201);
    const id = created.data.id;
    expect(created.data.scheduledAt).toBe(scheduledAt);
    expect((await api<RideOrder>(passenger, '/v1/orders', payload)).data.id).toBe(id);
    for (const driver of [first, second]) {
      const state = (await bootstrap(driver)).data;
      expect(state.driverPreorders.some(order => order.id === id)).toBe(true);
      expect(state.driverQueue.offer?.id).not.toBe(id);
    }
    expect((await accept(first, id)).error?.code).toBe('SCHEDULE_CONFIRMATION_REQUIRED');
    expect((await accept(first, id, new Date(Date.parse(scheduledAt) + 60_000).toISOString())).error?.code).toBe('SCHEDULE_CONFIRMATION_REQUIRED');
    const results = await Promise.all([accept(first, id, scheduledAt), accept(second, id, scheduledAt)]);
    expect(results.map(item => item.status).sort()).toEqual([200, 409]);
    const winner = results[0]!.status === 200 ? first : second;
    const loser = winner === first ? second : first;
    const booked = (await accept(winner, id, scheduledAt)).data;
    expect(booked.status).toBe('accepted');
    expect(booked.driverQueuePosition).toBeUndefined();
    expect((await bootstrap(passenger)).data.activePassengerOrder).toMatchObject({ id, scheduledAt, status: 'accepted' });
    expect((await bootstrap(loser)).data.driverPreorders.some(order => order.id === id)).toBe(false);
    expect((await transition(winner, id, 'driver_arriving')).error?.code).toBe('PREORDER_DEPARTURE_TOO_EARLY');
    expect((await api(winner, '/v1/driver/status', { status: 'online' })).status).toBe(200);
    await connection.execute("UPDATE driver_dispatch_settings SET delay_minutes=0 WHERE scope='grahovo'");
    const instantQuote = await quote(instantPassenger);
    const instant = await api<RideOrder>(instantPassenger, '/v1/orders', orderPayload(instantPassenger, instantQuote.data.quoteToken));
    expect(instant.status, JSON.stringify(instant.error)).toBe(201);
    expect((await accept(winner, instant.data.id)).data.status).toBe('driver_arriving');
    expect((await bootstrap(winner)).data.driverQueue.current?.id).toBe(instant.data.id);

    const near = new Date(Date.now() + 5 * 60_000);
    await connection.execute('UPDATE orders SET scheduled_at=? WHERE id=?', [near, id]);
    expect((await transition(winner, id, 'driver_arriving')).error?.code).toBe('DRIVER_ORDER_QUEUED');
    expect((await api(instantPassenger, `/v1/orders/${instant.data.id}/cancel`, {})).status).toBe(200);
    expect((await bootstrap(winner)).data.driverQueue.current).toBeNull();
    expect((await transition(winner, id, 'driver_arriving')).data.status).toBe('driver_arriving');
    expect((await bootstrap(winner)).data.driverPreorders.some(order => order.id === id)).toBe(false);
    expect((await transition(winner, id, 'driver_waiting')).data.waitingStartedAt).toBe(near.toISOString());
    expect((await transition(winner, id, 'in_progress')).data.waitingSeconds).toBe(0);
    expect((await transition(winner, id, 'completed')).data.status).toBe('completed');
  }, 30_000);

  it('keeps unclaimed future offers after the normal search timeout and hides offers after their pickup time', async () => {
    const scheduledAt = new Date(Math.ceil((Date.now() + 86_400_000) / 60_000) * 60_000).toISOString();
    const priced = await quote(expiryPassenger, scheduledAt);
    const order = await api<RideOrder>(expiryPassenger, '/v1/orders', orderPayload(expiryPassenger, priced.data.quoteToken, scheduledAt));
    expect(order.status).toBe(201);
    const id = order.data.id;
    await connection.execute('UPDATE orders SET created_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY) WHERE id=?', [id]);
    expect((await bootstrap(second)).data.driverPreorders.some(item => item.id === id)).toBe(true);
    const past = new Date(Date.now() - 60_000);
    await connection.execute('UPDATE orders SET scheduled_at=? WHERE id=?', [past, id]);
    expect((await bootstrap(second)).data.driverPreorders.some(item => item.id === id)).toBe(false);
    const expired = await accept(second, id, past.toISOString());
    expect(['ORDER_SEARCH_EXPIRED', 'ORDER_ALREADY_TAKEN']).toContain(expired.error?.code);
  });

  it('lets only the assigned driver wait mid-trip and extend the route without losing waiting or duplicating an edit', async () => {
    const rider = { id: randomUUID(), token: '' };
    await seedActor(rider, 6, 'passenger');
    const newRider = await bootstrap(rider);
    expect(newRider.data.addressHistory).toEqual([]);
    expect(newRider.data.firstRideSuggestions.map(address => address.place?.name)).toEqual(['Пятёрочка', 'Караоке-кафе «Максимум»']);
    await connection.execute("UPDATE drivers SET status='online' WHERE id=?", [first.driverId!]);
    const priced = await quote(rider);
    const created = await api<RideOrder>(rider, '/v1/orders', orderPayload(rider, priced.data.quoteToken));
    expect(created.status).toBe(201);
    const id = created.data.id;
    const path = `/v1/driver/orders/${id}`;
    const stop = { id: 'stop-qa', label: 'с. Грахово, ул. Колпакова, 8', houseNumber: '8', kind: 'house',
      coordinates: { latitude: 56.0469, longitude: 51.9613 } };
    const finish = { id: 'finish-qa', label: 'с. Грахово, ул. Колпакова, 10', houseNumber: '10', kind: 'house',
      coordinates: { latitude: 56.0472, longitude: 51.9618 } };
    const stopEdit = { address: stop, kind: 'stop', requestId: randomUUID() };
    expect((await accept(first, id)).status).toBe(200);
    expect((await api(first, '/v1/addresses/search?query=Колпакова%208&mode=suggest')).status).toBe(200);
    expect((await api(second, `${path}/destinations`, stopEdit)).status).toBe(404);
    expect((await api(first, `${path}/waiting/start`, {})).status).toBe(409);
    expect((await transition(first, id, 'driver_waiting')).status).toBe(200);
    expect((await transition(first, id, 'in_progress')).data.waitingStartedAt).toBeUndefined();
    const waiting = await api<RideOrder>(first, `${path}/waiting/start`, {});
    expect(waiting.data.waitingStartedAt).toBeTruthy();
    expect((await api<RideOrder>(first, `${path}/waiting/start`, {})).data.waitingStartedAt).toBe(waiting.data.waitingStartedAt);
    await connection.execute(`UPDATE orders SET waiting_started_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 125 SECOND),
      waiting_free_minutes=0, waiting_per_minute_minor=500 WHERE id=?`, [id]);
    const stopped = await api<RideOrder>(first, `${path}/waiting/stop`, {});
    expect(stopped.data.waitingPriceMinor).toBeGreaterThan(0);
    expect(stopped.data.waitingStartedAt).toBeUndefined();

    const edits = await Promise.all([api<RideOrder>(first, `${path}/destinations`, stopEdit), api<RideOrder>(first, `${path}/destinations`, stopEdit)]);
    for (const edit of edits) {
      expect(edit.status, edit.error?.message).toBe(200);
      expect(edit.data.destinations?.map(point => point.label)).toEqual([stop.label, destination.label]);
      expect(edit.data.waitingPriceMinor).toBe(stopped.data.waitingPriceMinor);
      expect(edit.data.priceMinor).toBeGreaterThan(stopped.data.priceMinor);
    }
    expect((await api(first, `${path}/destinations`, { ...stopEdit, requestId: randomUUID() })).status).toBe(422);
    const afterStop = await api<RideOrder>(first, `${path}/stops/complete`, { destinationIndex: 0 });
    expect(afterStop.data.nextDestinationIndex).toBe(1);
    const extended = await api<RideOrder>(first, `${path}/destinations`, { address: finish, kind: 'destination', requestId: randomUUID() });
    expect(extended.status, extended.error?.message).toBe(200);
    expect(extended.data.destination.label).toBe(finish.label);
    expect(extended.data.nextDestinationIndex).toBe(1);
    const viewed = await api<RideOrder>(rider, `/v1/orders/${id}`);
    expect(viewed.data.priceMinor).toBe(extended.data.priceMinor);
    expect(viewed.data.destinations?.map(point => point.label)).toEqual([stop.label, destination.label, finish.label]);
    const used = (await bootstrap(rider)).data.addressHistory.map(item => item.address.label);
    expect(used).toEqual([pickup.label, stop.label]);
    const [events] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM order_events WHERE order_id=? AND event_type='order.route_extended'`, [id]);
    expect(Number(events[0]?.total)).toBe(2);
  }, 30_000);
});
