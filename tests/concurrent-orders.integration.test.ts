import { randomUUID } from 'node:crypto';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { RideChatMessage, RideOrder, Tariff } from '../src/domain/models';
import { confirmAddressPoint } from '../src/domain/route-stops';
import { rideLivePriceMinor } from '../src/domain/waiting';
import { firstOrderPriceMinor } from '../src/domain/first-order-discount';
import { farePeriodAt } from '../src/domain/pricing';
import { currentInitialLegalAcceptance } from '../src/legal/documents';
import { signOrderQuote, signSession, verifyOrderQuote } from '../server/security';

const enabled = process.env.RUN_API_INTEGRATION === '1';
const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:4110';
const databaseUrl = process.env.MYSQL_URL ?? '';
const pickup = { id: 'qa-pickup', label: 'с. Грахово, ул. Ачинцева, 5', houseNumber: '5', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const destination = { id: 'qa-destination', label: 'с. Грахово, ул. Колпакова, 1Б', houseNumber: '1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } };
type Actor = { id: string; token: string; driverId?: string; deviceId: string };
type Result<T = RideOrder> = { status: number; data?: T; error?: { code?: string; message?: string } };
let connection: Connection;
let originalBookingEnabled = 0;
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
    connection = await mysql.createConnection({ uri: databaseUrl, timezone: 'Z' });
    await connection.query("SET SESSION time_zone = '+00:00'");
    const [settings] = await connection.query<RowDataPacket[]>('SELECT enabled FROM booking_settings WHERE id = 1');
    originalBookingEnabled = Number(settings[0]?.enabled ?? 0);
    await connection.execute('UPDATE booking_settings SET enabled = 1 WHERE id = 1');
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
    await connection.execute('UPDATE booking_settings SET enabled = ? WHERE id = 1', [originalBookingEnabled]);
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

  it('applies the local discount once, keeps it after cancellation and rejects a spent quote', async () => {
    const actor = passengers[0]!;
    const quoteResult = await api<{ quoteToken: string; tariffs: Tariff[] }>('/v1/quotes', actor, { pickup, destination });
    expect(quoteResult.status).toBe(200);
    for (const tariff of quoteResult.data!.tariffs) {
      expect(tariff.discountPercent).toBe(20);
      expect(tariff.priceMinor).toBe(Math.round(tariff.originalPriceMinor! * 0.8 / 1_000) * 1_000);
      expect(tariff.originalPriceMinor! % 1_000).toBe(0);
    }
    const first = await submit(actor, quoteResult.data!.quoteToken);
    expect(first.status, JSON.stringify(first.error)).toBe(201);
    expect(first.data!.promotionCode).toBe('first-local-order-20');
    expect(first.data!.waitingPerMinuteMinor).toBe(320);
    expect(first.data!.priceMinor).toBe(quoteResult.data!.tariffs[0]!.priceMinor);
    expect((await cancel(actor, first.data!)).status).toBe(200);
    const second = await create(actor);
    expect(second.promotionCode).toBe('first-local-order-20');
    const stale = await quote(actor);
    await connection.execute("UPDATE orders SET status='completed', promotion_code='first-local-order-50' WHERE id=?", [second.id]);
    const rejected = await submit(actor, stale);
    expect(rejected.status).toBe(409);
    expect(rejected.error?.code).toBe('PROMOTION_QUOTE_CHANGED');
    const next = await create(actor);
    expect(next.promotionCode).toBeUndefined();
    expect(next.priceMinor).toBe(second.originalPriceMinor);
    // Even after changing the original profile's phone, that phone cannot claim again.
    const replacement = passengers[1]!;
    const [users] = await connection.query<RowDataPacket[]>('SELECT id, phone FROM users WHERE id IN (?, ?)', [actor.id, replacement.id]);
    const originalPhone = users.find(user => user.id === actor.id)!.phone;
    const replacementPhone = users.find(user => user.id === replacement.id)!.phone;
    try {
      await connection.execute('UPDATE users SET phone=NULL WHERE id=?', [actor.id]);
      await connection.execute('UPDATE users SET phone=? WHERE id=?', [originalPhone, replacement.id]);
      const samePhone = await api<{ tariffs: Tariff[] }>('/v1/quotes', replacement, { pickup, destination });
      expect(samePhone.status).toBe(200);
      expect(samePhone.data!.tariffs[0]!.discountPercent).toBeUndefined();
    } finally {
      await connection.execute('UPDATE users SET phone=? WHERE id=?', [replacementPhone, replacement.id]);
      await connection.execute('UPDATE users SET phone=? WHERE id=?', [originalPhone, actor.id]);
    }
  }, 30_000);

  it('rejects an unspent quote from the old 50 percent offer and accepts a fresh quote', async () => {
    const actor = passengers[0]!;
    const currentToken = await quote(actor);
    const current = await verifyOrderQuote(currentToken, actor.id);
    const original = current.promotion!.originalPrices;
    const staleToken = await signOrderQuote({...current,
      prices:{economy:Math.floor(original.economy / 2),child:Math.floor(original.child / 2)},
      promotion:{code:'first-local-order-50',originalPrices:original},
    });
    const rejected = await submit(actor, staleToken);
    expect(rejected.status).toBe(409);
    expect(rejected.error?.code).toBe('PROMOTION_QUOTE_CHANGED');
    const created = await submit(actor, currentToken);
    expect(created.status, JSON.stringify(created.error)).toBe(201);
    expect(created.data!.promotionCode).toBe('first-local-order-20');
    expect(created.data!.priceMinor % 1_000).toBe(0);
  }, 30_000);

  it('discounts district routes but excludes intercity, including an intermediate intercity stop', async () => {
    const actor = passengers[0]!;
    const district = confirmAddressPoint({ id: 'qa-district-promo', label: 'д. Лолошур-Возжи', kind: 'settlement', details: 'Граховский район', coordinates: { latitude: 55.998771, longitude: 51.7719962 } }, { latitude: 55.998771, longitude: 51.7719962 });
    const intercity = confirmAddressPoint({ id: 'qa-intercity-promo', label: 'Можга', kind: 'settlement', coordinates: { latitude: 56.4439, longitude: 52.2274 } }, { latitude: 56.4439, longitude: 52.2274 });
    for (const [destinations, scope, discount] of [
      [[district], 'district', 20], [[intercity], 'intercity', undefined], [[intercity, destination], 'intercity', undefined],
    ] as const) {
      const result = await api<{ pricingScope: string; tariffs: Tariff[] }>('/v1/quotes', actor, { pickup, destination: destinations.at(-1), destinations });
      expect(result.status, JSON.stringify(result.error)).toBe(200);
      expect(result.data!.pricingScope).toBe(scope);
      expect(result.data!.tariffs[0]!.discountPercent).toBe(discount);
    }
  }, 30_000);

  it.each([undefined,1_000,5_000])('accepts an older quote and preserves upward rounding with step %s', async step => {
    const actor = passengers[0]!;
    const current = await verifyOrderQuote(await quote(actor), actor.id);
    const original = {economy:33_000,child:40_000};
    const legacyToken = await signOrderQuote({...current, fareRoundingMinor:step,fareRoundingMode:undefined,
      promotion:{code:'first-local-order-20',originalPrices:original},
      prices:{economy:firstOrderPriceMinor(original.economy,step??1_000,'up'),child:firstOrderPriceMinor(original.child,step??1_000,'up')},
    });
    const created = await submit(actor, legacyToken);
    expect(created.status, JSON.stringify(created.error)).toBe(201);
    expect(created.data!.fareRoundingMinor).toBe(step);
    expect(created.data!.fareRoundingMode).toBeUndefined();
    expect(created.data!.priceMinor).toBe(firstOrderPriceMinor(original.economy,step??1_000,'up'));
  }, 30_000);

  it.each([
    ['д. Поршур',56.0263962,51.7065836,'Граховский район'],
    ['д. Котловка',56.1180852,52.0150708,'Граховский район'],
    ['д. Яги-Какси',56.0906036,51.9506647,'Граховский район'],
    ['Резиденция Бабы Яги',56.1169,52.012,'Удмуртия'],
    ['г. Елабуга',55.76,52.05,'Республика Татарстан'],
  ] as const)('quotes %s to Grahovo at the same fare as the outward ride', async (label,latitude,longitude,details) => {
    const remote = confirmAddressPoint({id:label,label:`${label}, дом 1`,houseNumber:'1',details,kind:'house',coordinates:{latitude,longitude}}, {latitude,longitude});
    type Quote = {tariffs:Tariff[];pricingDistanceMeters:number};
    const outward = await api<Quote>('/v1/quotes',passengers[0]!,{pickup,destination:remote});
    const inbound = await api<Quote>('/v1/quotes',passengers[0]!,{pickup:remote,destination:pickup});
    expect(outward.status, JSON.stringify(outward.error)).toBe(200);
    expect(inbound.status, JSON.stringify(inbound.error)).toBe(200);
    expect(inbound.data!.tariffs.map(tariff=>tariff.priceMinor)).toEqual(outward.data!.tariffs.map(tariff=>tariff.priceMinor));
    expect(inbound.data!.pricingDistanceMeters).toBe(outward.data!.pricingDistanceMeters);
    for (const tariff of outward.data!.tariffs) {
      expect((tariff.originalPriceMinor ?? tariff.priceMinor) % 1_000).toBe(0);
      expect(tariff.priceMinor % 1_000).toBe(0);
    }
    if (label==='д. Котловка' || label==='Резиденция Бабы Яги') {
      expect(outward.data!.tariffs[0]!.originalPriceMinor).toBe({'07-22':85_000,'22-02':125_000,'02-07':195_000}[farePeriodAt()]);
    }
    if (label==='д. Яги-Какси') expect(outward.data!.tariffs[0]!.originalPriceMinor).toBe({'07-22':90_000,'22-02':100_000,'02-07':120_000}[farePeriodAt()]);
  }, 30_000);

  it('adds the Grahovo pickup leg for a Selyanur to Porshur order', async () => {
    const selyanur = confirmAddressPoint({id:'selyanur',label:'д. Селянур, ул. Средняя, 1',houseNumber:'1',details:'Граховский район',kind:'house',coordinates:{latitude:56.0503949,longitude:51.7220116}}, {latitude:56.0503949,longitude:51.7220116});
    const porshur = confirmAddressPoint({id:'porshur',label:'д. Поршур',details:'Граховский район',kind:'settlement',coordinates:{latitude:56.0263962,longitude:51.7065836}}, {latitude:56.0263962,longitude:51.7065836});
    const result = await api<{driverApproachDistanceMeters:number;pricingDistanceMeters:number;route:{distanceMeters:number};tariffs:Tariff[]}>('/v1/quotes',passengers[0]!,{pickup:selyanur,destination:porshur});
    expect(result.status,JSON.stringify(result.error)).toBe(200);
    expect(result.data!.driverApproachDistanceMeters).toBeGreaterThan(10_000);
    expect(result.data!.pricingDistanceMeters).toBe(result.data!.driverApproachDistanceMeters+result.data!.route.distanceMeters);
    expect(result.data!.tariffs[0]!.priceMinor % 1_000).toBe(0);
  }, 30_000);

  it('settles discounted waiting to the same ten-ruble total shown to the passenger', async () => {
    const order = await create(passengers[0]!);
    const driver = drivers[0]!;
    expect((await accept(driver, order)).status).toBe(200);
    for (const status of ['driver_arriving', 'driver_waiting']) {
      expect((await api(`/v1/driver/orders/${order.id}/transition`, driver, {status})).status).toBe(200);
    }
    expect((await api(`/v1/driver/orders/${order.id}/waiting/start`, driver, {})).status).toBe(200);
    await connection.execute('UPDATE orders SET waiting_started_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 181 SECOND) WHERE id=?', [order.id]);
    const preview = await api(`/v1/orders/${order.id}`, passengers[0]!);
    expect(preview.status).toBe(200);
    const stopped = await api(`/v1/driver/orders/${order.id}/waiting/stop`, driver, {});
    expect(stopped.status, JSON.stringify(stopped.error)).toBe(200);
    expect(stopped.data!.waitingPerMinuteMinor).toBe(320);
    expect(stopped.data!.fareRoundingMinor).toBe(1_000);
    expect(stopped.data!.fareRoundingMode).toBe('nearest');
    expect(stopped.data!.waitingPriceMinor).toBe(0);
    expect(stopped.data!.priceMinor).toBe(order.priceMinor);
    expect(rideLivePriceMinor(preview.data!)).toBe(stopped.data!.priceMinor);
    expect(rideLivePriceMinor(stopped.data!)).toBe(stopped.data!.priceMinor);
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
      api(`/v1/driver/orders/${current.id}/transition`, drivers[0]!, { status: 'completed' }),
      cancel(passengers[1]!, next),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await assignedOrders()).toHaveLength(0);
    const [rows] = await connection.query<RowDataPacket[]>('SELECT status FROM drivers WHERE id=?', [drivers[0]!.driverId]);
    expect(rows[0]!.status).toBe('online');
  }, 30_000);

  it('starts and settles waiting once when arrival and trip-start requests are retried concurrently', async () => {
    const order = await create(passengers[0]!);
    const accepted = await accept(drivers[0]!, order);
    expect(accepted.data?.status).toBe('driver_arriving');
    const path = `/v1/driver/orders/${order.id}/transition`;
    const arrivals = await Promise.all(Array.from({ length: 12 }, () => api(path, drivers[0]!, { status: 'driver_waiting' })));
    expect(arrivals.every(result => result.status === 200 && result.data?.waitingStartedAt)).toBe(true);
    expect(new Set(arrivals.map(result => result.data!.waitingStartedAt)).size).toBe(1);
    await connection.execute('UPDATE orders SET waiting_started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 270 SECOND) WHERE id = ?', [order.id]);
    const starts = await Promise.all(Array.from({ length: 12 }, () => api(path, drivers[0]!, { status: 'in_progress' })));
    expect(starts.every(result => result.status === 200 && !result.data?.waitingStartedAt)).toBe(true);
    expect(new Set(starts.map(result => result.data!.priceMinor)).size).toBe(1);
    expect(new Set(starts.map(result => result.data!.waitingSeconds)).size).toBe(1);
    expect(starts[0]!.data?.waitingSeconds).toBeGreaterThanOrEqual(270);
    const [events] = await connection.query<RowDataPacket[]>(
      "SELECT to_status, COUNT(*) AS total FROM order_events WHERE order_id=? AND event_type='order.transition' GROUP BY to_status ORDER BY to_status", [order.id]);
    expect(events.map(row => [row.to_status, Number(row.total)])).toEqual([['driver_waiting', 1], ['in_progress', 1]]);
  }, 30_000);

  it('completes once and promotes the queued ride once for 12 simultaneous finish requests', async () => {
    const order = await create(passengers[0]!);
    expect((await accept(drivers[0]!, order)).status).toBe(200);
    const queued = await create(passengers[1]!);
    const queuedAcceptance = await accept(drivers[0]!, queued);
    expect(queuedAcceptance.status).toBe(200);
    expect(queuedAcceptance.data?.status).toBe('accepted');
    expect(queuedAcceptance.data?.driverQueuePosition).toBe(2);
    expect((await api(`/v1/driver/orders/${queued.id}/transition`, drivers[0]!, { status: 'driver_waiting' })).status).toBe(409);
    await api('/v1/driver/location', drivers[0]!, { ...pickup.coordinates, accuracyMeters: 10 }, 'PUT');
    for (const status of ['driver_arriving', 'driver_waiting', 'in_progress']) {
      const response = await api(`/v1/driver/orders/${order.id}/transition`, drivers[0]!, { status });
      expect(response.status, JSON.stringify(response.error)).toBe(200);
    }
    const responses = await Promise.all(Array.from({ length: 12 }, () => api(`/v1/driver/orders/${order.id}/transition`,
      drivers[0]!, { status: 'completed' })));
    expect(responses.every(response => response.status === 200 && response.data?.status === 'completed')).toBe(true);
    const [events] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM order_events WHERE order_id=? AND to_status='completed'", [order.id]);
    expect(Number(events[0]!.total)).toBe(1);
    expect(await assignedOrders()).toEqual([expect.objectContaining({ id: queued.id, status: 'driver_arriving', driver_queue_position: 1 })]);
    const [promotions] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM order_events WHERE order_id=? AND event_type='driver.queue.promoted'", [queued.id]);
    expect(Number(promotions[0]!.total)).toBe(1);
    const next = await api(`/v1/orders/${queued.id}`, passengers[1]!);
    expect(next.data?.waitingStartedAt).toBeUndefined();
    const arrival = await api(`/v1/driver/orders/${queued.id}/transition`, drivers[0]!, { status: 'driver_waiting' });
    expect(arrival.status).toBe(200);
    expect(arrival.data?.waitingStartedAt).toBeTruthy();
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
