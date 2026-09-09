import { randomUUID } from 'node:crypto';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { RideChatMessage, RideOrder } from '../src/domain/models';
import { currentInitialLegalAcceptance } from '../src/legal/documents';
import { signSession } from '../server/security';

const enabled = process.env.RUN_API_INTEGRATION === '1';
const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:4110';
const databaseUrl = process.env.MYSQL_URL ?? '';
const pickup = { id: 'qa-pickup', label: 'с. Грахово, ул. Ачинцева, 5', houseNumber: '5', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const destination = { id: 'qa-destination', label: 'с. Грахово, ул. Колпакова, 1Б', houseNumber: '1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } };
type Actor = { id: string; token: string; driverId?: string; deviceId: string };
type Result<T = RideOrder> = { status: number; data?: T; error?: { code?: string; message?: string } };
let connection: Connection;
const passengers: Actor[] = [];
const drivers: Actor[] = [];
const sockets: Socket[] = [];

async function api<T = RideOrder>(path: string, actor: Actor, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<Result<T>> {
  const response = await fetch(`${apiUrl}${path}`, {
    method, signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${actor.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, ...await response.json() };
}

async function quote(actor: Actor) {
  const response = await api<{ quoteToken: string }>('/v1/quotes', actor, { pickup, destination });
  expect(response.status, JSON.stringify(response.error)).toBe(200);
  return response.data!.quoteToken;
}

function submit(actor: Actor, quoteToken: string, key = randomUUID()) {
  return api('/v1/orders', actor, {
    pickup, destination, quoteToken, tariff: 'economy', paymentMethod: 'cash',
    idempotencyKey: key, deviceId: actor.deviceId, legalAcceptance: currentInitialLegalAcceptance(),
  });
}

async function create(actor: Actor) {
  const response = await submit(actor, await quote(actor));
  expect(response.status, JSON.stringify(response.error)).toBe(201);
  return response.data!;
}
async function createMany(actors: Actor[]) {
  // Drain every request before asserting so cleanup cannot race unfinished writes.
  const results = await Promise.allSettled(actors.map(create));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return results.map((result) => (result as PromiseFulfilledResult<RideOrder>).value);
}
const accept = (actor: Actor, order: RideOrder) => api(`/v1/driver/orders/${order.id}/accept`, actor, {});
const cancel = (actor: Actor, order: RideOrder) => api(`/v1/orders/${order.id}/cancel`, actor, {});

async function assignedOrders() {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, driver_id, IF(active_driver_id IS NULL, 2, 1) AS driver_queue_position, active_driver_id, status
     FROM orders WHERE passenger_id IN (?) AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')`,
    [passengers.map((actor) => actor.id)],
  );
  return rows;
}

async function connect(actor: Actor) {
  const socket = io(apiUrl, { auth: { token: actor.token }, transports: ['websocket'], forceNew: true, autoConnect: false });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timed out')), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
    socket.connect();
  });
  return socket;
}

describe.skipIf(!enabled)('concurrent orders against an isolated API database', () => {
  beforeAll(async () => {
    const target = new URL(databaseUrl);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^\/taxi_(qa|test)_/.test(target.pathname) ||
      !['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
      throw new Error('Concurrency tests require an isolated local taxi_qa_* or taxi_test_* database');
    }
    connection = await mysql.createConnection(databaseUrl);
    for (let index = 0; index < 44; index++) {
      const driver = index >= 32;
      const id = randomUUID();
      const actor: Actor = { id, token: '', deviceId: `qa-device-${id}` };
      await connection.execute(`INSERT INTO users (id,name,phone,phone_verified_at,gender,profile_completed_at)
        VALUES (?, ?, ?, UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3))`,
      [id, `QA ${driver ? 'водитель' : 'пассажир'} ${index}`, `+7909091${String(index).padStart(4, '0')}`]);
      await connection.execute("INSERT INTO user_roles (user_id,role) VALUES (?, 'passenger')", [id]);
      if (driver) {
        actor.driverId = randomUUID();
        await connection.execute("INSERT INTO user_roles (user_id,role) VALUES (?, 'driver')", [id]);
        await connection.execute("INSERT INTO drivers (id,user_id,status,has_child_seat) VALUES (?, ?, 'online', TRUE)", [actor.driverId, id]);
        await connection.execute(`INSERT INTO vehicles (id,driver_id,make,model,year,color,color_hex,plate)
          VALUES (?, ?, 'Lada', 'Granta', 2024, 'Жёлтая', '#F6C945', ?)`, [randomUUID(), actor.driverId, `QA${index}18`]);
        drivers.push(actor);
      } else passengers.push(actor);
      actor.token = await signSession({ id, roles: driver ? ['passenger', 'driver'] : ['passenger'] });
    }
  }, 30_000);

  beforeEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await connection.query('DELETE FROM orders WHERE passenger_id IN (?)', [passengers.map((actor) => actor.id)]);
    await connection.query("UPDATE drivers SET status='online' WHERE id IN (?)", [drivers.map((actor) => actor.driverId)]);
    await connection.query('UPDATE users SET order_blocked_until=NULL,order_block_reason=NULL WHERE id IN (?)', [passengers.map((actor) => actor.id)]);
  });

  afterAll(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    if (!connection) return;
    await connection.query('DELETE FROM orders WHERE passenger_id IN (?)', [passengers.map((actor) => actor.id)]);
    await connection.query('DELETE FROM drivers WHERE id IN (?)', [drivers.map((actor) => actor.driverId)]);
    await connection.query('DELETE FROM users WHERE id IN (?)', [[...passengers, ...drivers].map((actor) => actor.id)]);
    await connection.end();
  });

  it('returns the same order for 16 simultaneous retries of one create request', async () => {
    const actor = passengers[0]!;
    const quoteToken = await quote(actor);
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 16 }, () => submit(actor, quoteToken, key)));
    expect(responses.map((response) => response.status).every((status) => status === 200 || status === 201),
      JSON.stringify(responses.map((response) => ({ status: response.status, code: response.error?.code })))).toBe(true);
    expect(new Set(responses.map((response) => response.data?.id)).size).toBe(1);
    const [rows] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM orders WHERE passenger_id=?', [actor.id]);
    expect(Number(rows[0]!.total)).toBe(1);
  }, 30_000);

  it('allows only one active order when one passenger submits 16 different requests', async () => {
    const actor = passengers[0]!;
    const quoteToken = await quote(actor);
    const responses = await Promise.all(Array.from({ length: 16 }, () => submit(actor, quoteToken)));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409 && response.error?.code === 'ACTIVE_ORDER_EXISTS')).toHaveLength(15);
  }, 30_000);

  it('creates 32 independent passenger orders at once without data mixing', async () => {
    const orders = await createMany(passengers);
    expect(new Set(orders.map((order) => order.id)).size).toBe(32);
    expect(orders.map((order) => order.passengerId)).toEqual(passengers.map((actor) => actor.id));
  }, 30_000);

  it('allows only one active order across 12 accounts sharing one device', async () => {
    const actors = passengers.slice(0, 12).map((actor) => ({ ...actor, deviceId: 'qa-shared-device' }));
    const tokens = await Promise.all(actors.map(quote));
    const responses = await Promise.all(actors.map((actor, index) => submit(actor, tokens[index]!)));
    expect(responses.filter((response) => ![201, 409].includes(response.status)), JSON.stringify(responses)).toHaveLength(0);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409 && response.error?.code === 'ACTIVE_ORDER_EXISTS')).toHaveLength(11);
  }, 30_000);

  it('allows exactly one of 12 drivers to take the same order', async () => {
    const order = await create(passengers[0]!);
    const responses = await Promise.all(drivers.map((driver) => accept(driver, order)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(11);
    expect(await assignedOrders()).toHaveLength(1);
  }, 30_000);

  it('assigns 12 orders among 6 competing drivers with one current and one queued each', async () => {
    const orders = await createMany(passengers.slice(0, 12));
    const responses = await Promise.all(drivers.slice(0, 6).flatMap((driver) => orders.map((order) => accept(driver, order))));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(12);
    expect(responses.filter((response) => ![200, 409].includes(response.status)),
      JSON.stringify(responses.filter((response) => ![200, 409].includes(response.status)))).toHaveLength(0);
    const assigned = await assignedOrders();
    expect(assigned).toHaveLength(12);
    for (const driver of drivers.slice(0, 6)) {
      const own = assigned.filter((order) => order.driver_id === driver.driverId);
      expect(own.map((order) => Number(order.driver_queue_position)).sort()).toEqual([1, 2]);
      expect(own.filter((order) => order.active_driver_id === driver.driverId)).toHaveLength(1);
      expect(own.filter((order) => order.active_driver_id === null)).toHaveLength(1);
    }
  }, 30_000);

  it('never gives one driver more than two orders when 8 accept requests arrive together', async () => {
    const orders = await createMany(passengers.slice(0, 8));
    const responses = await Promise.all(orders.map((order) => accept(drivers[0]!, order)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(2);
    expect(responses.filter((response) => response.error?.code === 'DRIVER_QUEUE_FULL')).toHaveLength(6);
    expect((await assignedOrders()).map((order) => Number(order.driver_queue_position)).sort()).toEqual([1, 2]);
  }, 30_000);

  it('keeps cancellation final while 12 drivers race to accept that order', async () => {
    for (let round = 0; round < 8; round++) {
      const passenger = passengers[round]!;
      const order = await create(passenger);
      const responses = await Promise.all([cancel(passenger, order), ...drivers.map((driver) => accept(driver, order))]);
      expect(responses[0]!.status).toBe(200);
      expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
      const saved = await api(`/v1/orders/${order.id}`, passenger);
      expect(saved.data?.status).toBe('cancelled');
      expect(await assignedOrders()).toHaveLength(0);
    }
  }, 30_000);

  it('handles completion and cancellation of the next order at the same time', async () => {
    const [current, next] = await createMany(passengers.slice(0, 2));
    if (!current || !next) throw new Error('Expected two orders');
    expect((await accept(drivers[0]!, current)).status).toBe(200);
    expect((await accept(drivers[0]!, next)).status).toBe(200);
    expect((await api('/v1/driver/location', drivers[0]!, { ...pickup.coordinates, accuracyMeters: 10 }, 'PUT')).status).toBe(200);
    for (const status of ['driver_arriving', 'driver_waiting', 'in_progress']) {
      const response = await api(`/v1/driver/orders/${current.id}/transition`, drivers[0]!, { status });
      expect(response.status, JSON.stringify(response.error)).toBe(200);
    }
    const responses = await Promise.all([
      api(`/v1/driver/orders/${current.id}/transition`, drivers[0]!, { status: 'completed', paymentReceived: true }),
      cancel(passengers[1]!, next),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await assignedOrders()).toHaveLength(0);
    const [rows] = await connection.query<RowDataPacket[]>('SELECT status FROM drivers WHERE id=?', [drivers[0]!.driverId]);
    expect(rows[0]!.status).toBe('online');
  }, 30_000);

  it('records payment and completion only once for 12 simultaneous finish requests', async () => {
    const order = await create(passengers[0]!);
    expect((await accept(drivers[0]!, order)).status).toBe(200);
    await api('/v1/driver/location', drivers[0]!, { ...pickup.coordinates, accuracyMeters: 10 }, 'PUT');
    for (const status of ['driver_arriving', 'driver_waiting', 'in_progress']) {
      const response = await api(`/v1/driver/orders/${order.id}/transition`, drivers[0]!, { status });
      expect(response.status, JSON.stringify(response.error)).toBe(200);
    }
    const responses = await Promise.all(Array.from({ length: 12 }, () => api(`/v1/driver/orders/${order.id}/transition`,
      drivers[0]!, { status: 'completed', paymentReceived: true })));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(11);
    const [events] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM order_events WHERE order_id=? AND to_status='completed'", [order.id]);
    expect(Number(events[0]!.total)).toBe(1);
    expect(await assignedOrders()).toHaveLength(0);
  }, 30_000);

  it('keeps an order cancelled when its driver releases it simultaneously', async () => {
    for (let round = 0; round < 8; round++) {
      const order = await create(passengers[round]!);
      expect((await accept(drivers[0]!, order)).status).toBe(200);
      const responses = await Promise.all([
        cancel(passengers[round]!, order),
        api(`/v1/driver/orders/${order.id}/release`, drivers[0]!, { reason: 'Тестовая неисправность автомобиля' }),
      ]);
      expect(responses[0]!.status).toBe(200);
      expect([200, 409]).toContain(responses[1]!.status);
      expect((await api(`/v1/orders/${order.id}`, passengers[round]!)).data?.status).toBe('cancelled');
      expect(await assignedOrders()).toHaveLength(0);
    }
  }, 30_000);

  it('isolates simultaneous chats and restored state between two passenger/driver pairs', async () => {
    const [one, two] = await createMany(passengers.slice(0, 2));
    if (!one || !two) throw new Error('Expected two orders');
    await Promise.all([accept(drivers[0]!, one), accept(drivers[1]!, two)]);
    const [firstSocket, secondSocket, outsiderSocket] = await Promise.all([connect(drivers[0]!), connect(drivers[1]!), connect(passengers[2]!)]);
    const received: string[][] = [[], [], []];
    [firstSocket, secondSocket, outsiderSocket].forEach((socket, index) => socket.on('ride-chat:message', (message: RideChatMessage) => received[index]!.push(message.orderId)));
    const messages = await Promise.all([one, two].map((order, index) => api(`/v1/orders/${order.id}/messages`, passengers[index]!, { id: randomUUID(), body: `Тестовая поездка ${index}` })));
    expect(messages.map((message) => message.status)).toEqual([201, 201]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toEqual([[one.id], [two.id], []]);
    expect((await api(`/v1/orders/${one.id}/messages`, passengers[1]!)).status).toBe(403);
    for (const [index, order] of [one, two].entries()) {
      const bootstrap = await api<{ activePassengerOrder: RideOrder }>('/v1/bootstrap', passengers[index]!);
      expect(bootstrap.data?.activePassengerOrder.id).toBe(order.id);
    }
  }, 30_000);

  it('removes taken and cancelled offers for other drivers without broadcasting passenger data', async () => {
    const orders = await createMany(passengers.slice(0, 3));
    const [driverSocket, outsiderSocket] = await Promise.all([connect(drivers[1]!), connect(passengers[3]!)]);
    const received: unknown[] = [];
    const outsiderEvents: unknown[] = [];
    driverSocket.on('order:unavailable', (event) => received.push(event));
    outsiderSocket.on('order:unavailable', (event) => outsiderEvents.push(event));
    expect((await accept(drivers[0]!, orders[0]!)).status).toBe(200);
    await expect.poll(() => received.length).toBe(1);
    expect((await cancel(passengers[1]!, orders[1]!)).status).toBe(200);
    await expect.poll(() => received.length).toBe(2);
    expect(received).toEqual([{ orderId: orders[0]!.id }, { orderId: orders[1]!.id }]);
    expect(outsiderEvents).toEqual([]);
    const offers = await api<RideOrder[]>('/v1/driver/offers', drivers[1]!);
    expect(offers.data?.filter((order) => orders.some((created) => created.id === order.id)).map((order) => order.id))
      .toEqual([orders[2]!.id]);
  }, 30_000);
});
