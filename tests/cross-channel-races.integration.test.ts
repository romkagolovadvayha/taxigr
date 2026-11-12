import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { io, type Socket } from 'socket.io-client';
import dotenv from 'dotenv';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RideOrder, RideChatMessage } from '../src/domain/models';
import { currentInitialLegalAcceptance } from '../src/legal/documents';
import { fareRoundingMinor, fareRoundingMode } from '../src/domain/pricing';
import { discountedFareRoundingMinor } from '../src/domain/first-order-discount';
import { rideMessengerActionData, type RideMessengerAction } from '../server/ride-messenger';
import { signSession } from '../server/security';
import { searchPriceIncreaseChoices } from '../src/domain/search-price-increase';
import type { RelayResponse, RelayRequest } from '../src/api/max-relay-protocol';

const enabled = process.env.RUN_CROSS_CHANNEL_RACES === '1';
const origin = 'http://127.0.0.1:4230', primary = 'http://127.0.0.1:4231', proxy = 'http://127.0.0.1:4235/taxigr';
const database = 'mysql://root@127.0.0.1:3312/taxi_qa_races_20261112';
type Provider = 'max' | 'vk' | 'telegram';
type Actor = { id: string; token: string; external: string; device: string; driverId?: string; index: number };
type Result<T = RideOrder> = { status: number; data?: T; error?: { code?: string; message?: string } };
type Quote = { quoteToken: string; tariffs: { code: string; priceMinor: number; originalPriceMinor?: number }[]; fareRoundingMinor?: number; fareRoundingMode?: string };
type BotResult = { text: string; alert?: boolean };
let db: mysql.Connection, sequence = 0, calls = 0;
const passengers: Actor[] = [], drivers: Actor[] = [];
const results: { scenario: string; requests: number; elapsedMs: number }[] = [];
const relayStops: (() => Promise<void>)[] = [];
const pickup = { id: 'race-a', label: 'с. Грахово, ул. Ачинцева, 5', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const destination = { id: 'race-b', label: 'с. Грахово, ул. Колпакова, 1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } };
const extra = { id: 'race-c', label: 'с. Грахово, ул. 50 лет Победы, 19', coordinates: { latitude: 56.055332, longitude: 51.960263 } };

async function drain<T>(tasks: Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(tasks);
  const rejected = settled.find(item => item.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  return settled.map(item => (item as PromiseFulfilledResult<T>).value);
}
function scenario(name: string, work: () => Promise<void>, timeout = 40_000) {
  it(name, async () => {
    calls = 0; const started = performance.now(); await work();
    results.push({ scenario: name, requests: calls, elapsedMs: Math.round(performance.now() - started) });
  }, timeout);
}
async function api<T = RideOrder>(actor: Actor, path: string, body?: unknown, base = primary, requestId?: string): Promise<Result<T>> {
  calls++;
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${actor.token}`, 'X-Forwarded-For': `2001:db8:${actor.id.replaceAll('-', '').slice(0, 24).match(/.{4}/g)!.join(':')}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(requestId ? { 'X-Taxi-Request-Id': requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = { status: response.status, ...await response.json() } as Result<T>;
  expect(result.status, result.error?.code ?? result.error?.message).toBeLessThan(500);
  return result;
}
async function quote(actor: Actor, scheduledAt?: string): Promise<Quote> {
  const result = await api<Quote>(actor, '/v1/quotes', { pickup, destination, scheduledAt });
  expect(result.status, result.error?.message).toBe(200); return result.data!;
}
function submit(actor: Actor, q: Quote, key = randomUUID(), base = primary, device = actor.device, requestId?: string, scheduledAt?: string) {
  return api(actor, '/v1/orders', { pickup, destination, tariff: 'economy', paymentMethod: 'cash', quoteToken: q.quoteToken,
    idempotencyKey: key, deviceId: device, legalAcceptance: currentInitialLegalAcceptance(), scheduledAt }, base, requestId);
}
async function create(actor: Actor, scheduledAt?: string) {
  const result = await submit(actor, await quote(actor, scheduledAt), randomUUID(), primary, actor.device, undefined, scheduledAt);
  expect(result.status, result.error?.message).toBe(201);
  return result.data!;
}
async function bot(actor: Actor, order: RideOrder, action: RideMessengerAction, provider: Provider = 'vk', eventId = randomUUID()) {
  calls++;
  const response = await fetch(origin + '/__qa/bot-action', { method: 'POST', signal: AbortSignal.timeout(25_000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, externalUserId: actor.external, chatId: actor.external, eventId, sourceMessageId: 'message:synthetic', data: rideMessengerActionData(order.id, action) }) });
  const result = await response.json() as Result<BotResult>;
  expect(response.status, result.error?.message).toBe(200); return result.data!;
}
async function booking(actor: Actor, provider: Provider, draftId: string, eventId = randomUUID()) {
  calls++;
  const response = await fetch(origin + '/__qa/booking-message', { method: 'POST', signal: AbortSignal.timeout(35_000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, externalUserId: actor.external, chatId: actor.external, eventId, text: `b:confirm:${draftId}` }) });
  const payload = await response.json() as Result;
  expect(response.status, payload.error?.message).toBe(200);
}
async function seedDraft(actor: Actor, provider: Provider) {
  const q = await quote(actor), tariff = q.tariffs.find(item => item.code === 'economy')!;
  const draft = { id: randomUUID(), flowVersion: 2, stage: 'confirm', pickup, destination, pickupRaw: pickup.label, destinationRaw: destination.label,
    quoteToken: q.quoteToken, priceMinor: tariff.priceMinor, originalPriceMinor: tariff.originalPriceMinor, quotedAt: Date.now(),
    fareRoundingMinor: tariff.originalPriceMinor === undefined ? fareRoundingMinor : discountedFareRoundingMinor, fareRoundingMode };
  await db.execute(`INSERT INTO messenger_booking_drafts (provider,external_user_id,chat_id,draft_json,expires_at)
    VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 HOUR))`, [provider, actor.external, actor.external, JSON.stringify(draft)]);
  return { draft, q };
}
async function mixedAccept(actor: Actor, order: RideOrder, index: number): Promise<{ ok: boolean; driverId?: string }> {
  if (index % 4 === 0) { const response = await api(actor, `/v1/driver/orders/${order.id}/accept`, {}, index % 8 ? primary : proxy); return { ok: response.status === 200, driverId: response.data?.driverId }; }
  const result = await bot(actor, order, 'accept', (['vk', 'max', 'telegram'] as const)[(index - 1) % 3]);
  return { ok: !result.alert && result.text === 'Заказ принят ✅', driverId: actor.driverId };
}
async function transition(actor: Actor, order: RideOrder, status: string, paymentReceived?: boolean) {
  const result = await api(actor, `/v1/driver/orders/${order.id}/transition`, { status, paymentReceived });
  expect(result.status, result.error?.message).toBe(200); return result.data!;
}
async function start(actor: Actor, order: RideOrder) {
  expect((await api(actor, `/v1/driver/orders/${order.id}/accept`, {})).status).toBe(200);
  await transition(actor, order, 'driver_waiting'); await transition(actor, order, 'in_progress');
}
async function ownedOrders() {
  const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM orders WHERE passenger_id IN (?) ORDER BY created_at,id', [passengers.map(actor => actor.id)]); return rows;
}
async function events(order: RideOrder, type: string, to?: string) {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM order_events WHERE order_id=? AND event_type=?${to ? ' AND to_status=?' : ''}`, [order.id, type, ...(to ? [to] : [])]);
  return Number(rows[0]!.total);
}
async function oneOrder(actor: Actor) {
  const [rows] = await db.query<RowDataPacket[]>('SELECT COUNT(*) total FROM orders WHERE passenger_id=?', [actor.id]);
  const [messages] = await db.query<RowDataPacket[]>("SELECT JSON_UNQUOTE(JSON_EXTRACT(response_json,'$.text')) AS text FROM messenger_booking_events WHERE external_user_id=? ORDER BY created_at DESC LIMIT 2", [actor.external]);
  expect(Number(rows[0]!.total), JSON.stringify(messages)).toBe(1);
}
async function completedFixture(passenger: Actor, driver: Actor) {
  if (!driver.driverId) throw new Error('A completed ride fixture needs a driver');
  const id = randomUUID();
  await db.execute(`INSERT INTO orders
    (id,passenger_id,driver_id,tariff,status,pickup_label,pickup_lat,pickup_lon,destination_label,destination_lat,destination_lon,
     distance_meters,duration_seconds,price_minor,base_price_minor,commission_minor,commission_bps,idempotency_key,completed_at)
    VALUES (?,?,?,'economy','completed',?,56.0477,51.9586,?,56.04576,51.96165,1000,300,15000,15000,0,0,?,UTC_TIMESTAMP(3))`,
  [id, passenger.id, driver.driverId, pickup.label, destination.label, randomUUID()]);
  return { id } as RideOrder;
}
async function socketFor(actor: Actor): Promise<Socket> {
  const socket = io(origin, { auth: { token: actor.token }, transports: ['websocket'], reconnection: false, autoConnect: false });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.disconnect(); reject(new Error('QA_SOCKET_TIMEOUT')); }, 5000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', error => { clearTimeout(timeout); socket.disconnect(); reject(error); }); socket.connect();
  }); return socket;
}
type RealClient = { request(request: Omit<RelayRequest, 'id' | 'expiresAt'>, signal?: AbortSignal, timeoutMs?: number): Promise<RelayResponse> };
async function realClients(): Promise<{ vk: RealClient; max: RealClient }> {
  const { startBotApiRelay } = await import('../server/bot-api-relay');
  const { VkBotTransport } = await import('../src/api/vk-bot-transport'), { VkRelayClient } = await import('../src/api/vk-relay-client');
  const { MaxBotTransport } = await import('../src/api/max-bot-transport'), { MaxRelayClient } = await import('../src/api/max-relay-client');
  const env: Record<string, string> = {}; for (const file of ['.env', '.env.local']) Object.assign(env, dotenv.parse(await readFile(file)));
  const runtime = JSON.parse(await readFile('tmp/max-app-runtime.json', 'utf8')), approved = JSON.parse(await readFile('tmp/vk-relay-service-account.json', 'utf8'));
  expect(approved.userId).toBe('33610634'); expect(env.VK_COMMUNITY_ID).toBe('193790756');
  const common = { channel: runtime.channel, publicKey: runtime.publicKey };
  const vk = { botToken: env.VK_BOT_TOKEN!, groupId: env.VK_COMMUNITY_ID!, serviceUserId: approved.userId };
  const max = { botToken: runtime.botToken, chatId: runtime.chatId, serviceUserId: runtime.serviceUserId };
  const delegate = { hasRoute: () => true, log: { warn: () => {} }, inject: async (options: { method: string; url: string; headers: HeadersInit; payload?: string; remoteAddress?: string }) => {
    const headers = new Headers(options.headers); if (options.remoteAddress) headers.set('X-Forwarded-For', options.remoteAddress);
    const response = await fetch(origin + options.url, { method: options.method, headers, body: options.payload });
    return { statusCode: response.status, body: await response.text() };
  } } as unknown as FastifyInstance;
  for (const name of ['vk', 'max'] as const) {
    const api = name === 'vk' ? new VkBotTransport({ token: vk.botToken, groupId: vk.groupId, serviceUserId: vk.serviceUserId })
      : new MaxBotTransport({ token: max.botToken, chatId: max.chatId, serviceUserId: max.serviceUserId });
    relayStops.push(await startBotApiRelay(delegate, { api, label: name === 'vk' ? 'VK' : 'MAX', recipientId: name === 'vk' ? vk.serviceUserId : max.chatId, channel: runtime.channel, secretKey: runtime.secretKey }));
  }
  return { vk: new VkRelayClient({ ...common, ...vk }), max: new MaxRelayClient({ ...common, ...max }) };
}

describe.skipIf(!enabled)('app, ordinary bot callbacks and reserve-channel races', () => {
  beforeAll(async () => {
    expect(new URL(process.env.MYSQL_URL ?? '').pathname).toBe('/taxi_qa_races_20261112');
    expect((await fetch(origin + '/health/ready')).status).toBe(200);
    expect((await (await fetch(origin + '/__qa/network-guard')).json()).data.enabled).toBe(true);
    db = await mysql.createConnection({ uri: database, timezone: 'Z' });
    await db.query("SET SESSION time_zone = '+00:00'");
    for (let index = 0; index < 54; index++) {
      const isDriver = index >= 36;
      const actor: Actor = { id: randomUUID(), external: String(900_688_000 + index), token: '', device: 'qa-races-' + randomUUID(), index };
      await db.execute(`INSERT INTO users (id,name,phone,phone_verified_at,gender,profile_completed_at) VALUES (?,?,?,UTC_TIMESTAMP(3),'male',UTC_TIMESTAMP(3))`, [actor.id, `Race QA ${index}`, '+790688' + String(index).padStart(5, '0')]);
      await db.execute("INSERT INTO user_roles (user_id,role) VALUES (?,'passenger')", [actor.id]);
      if (isDriver) {
        actor.driverId = randomUUID(); await db.execute("INSERT INTO user_roles (user_id,role) VALUES (?,'driver')", [actor.id]);
        await db.execute("INSERT INTO drivers (id,user_id,status,has_child_seat) VALUES (?,?,'online',TRUE)", [actor.driverId, actor.id]);
        await db.execute("INSERT INTO driver_priority_assignments (driver_id,scope) VALUES (?,'grahovo'),(?,'district'),(?,'intercity')", [actor.driverId, actor.driverId, actor.driverId]);
        await db.execute(`INSERT INTO vehicles (id,driver_id,make,model,year,color,color_hex,plate) VALUES (?,?,'Lada','Granta',2024,'Белый','#FFFFFF',?)`, [randomUUID(), actor.driverId, `RC${index}18`]);
        drivers.push(actor);
      } else passengers.push(actor);
      for (const provider of ['vk', 'max', 'telegram']) await db.execute(`INSERT INTO user_messenger_accounts (user_id,provider,external_user_id,chat_id) VALUES (?,?,?,?)`, [actor.id, provider, actor.external, actor.external]);
      actor.token = await signSession({ id: actor.id, roles: isDriver ? ['passenger', 'driver'] : ['passenger'] });
    }
    await db.execute('UPDATE booking_settings SET enabled=1 WHERE id=1');
  }, 30_000);
  beforeEach(async () => {
    sequence++;
    await db.query('DELETE FROM orders WHERE passenger_id IN (?)', [passengers.map(actor => actor.id)]);
    await db.query("UPDATE drivers SET status='online' WHERE id IN (?)", [drivers.map(actor => actor.driverId)]);
    await db.query('UPDATE users SET order_blocked_until=NULL,order_block_reason=NULL WHERE id IN (?)', [passengers.map(actor => actor.id)]);
    for (const table of ['messenger_booking_events', 'messenger_booking_drafts']) await db.query(`DELETE FROM ${table} WHERE external_user_id IN (?)`, [[...passengers, ...drivers].map(actor => actor.external)]);
  });
  afterEach(async () => { await drain(relayStops.splice(0).map(stop => stop())); });
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM orders WHERE passenger_id IN (?)', [passengers.map(actor => actor.id)]);
      for (const table of ['messenger_booking_events', 'messenger_booking_drafts']) await db.query(`DELETE FROM ${table} WHERE external_user_id IN (?)`, [[...passengers, ...drivers].map(actor => actor.external)]);
      await db.query('DELETE FROM users WHERE id IN (?)', [[...passengers, ...drivers].map(actor => actor.id)]); await db.end();
    }
    await mkdir('artifacts/concurrency-2026-11-12', { recursive: true });
    await writeFile('artifacts/concurrency-2026-11-12/results.json', JSON.stringify({ productionTouched: false, ordinaryBotDelivery: 'synthetic, no external sends', results }, null, 2));
  });

  scenario('creates 32 independent app/proxy/bot orders concurrently without mixing passengers', async () => {
    const actors = passengers.slice(0, 32), quotes = await drain(actors.map(actor => quote(actor)));
    const drafts = await drain(actors.slice(24).map((actor, i) => seedDraft(actor, i % 2 ? 'max' : 'vk')));
    await drain(actors.map(async (actor, i) => {
      if (i < 24) expect((await submit(actor, quotes[i]!, randomUUID(), i % 2 ? proxy : primary)).status).toBe(201);
      else await booking(actor, (i - 24) % 2 ? 'max' : 'vk', drafts[i - 24]!.draft.id);
    }));
    const rows = await ownedOrders();
    const [messages] = await db.query<RowDataPacket[]>("SELECT JSON_UNQUOTE(JSON_EXTRACT(response_json,'$.text')) AS text FROM messenger_booking_events WHERE external_user_id IN (?) LIMIT 2", [actors.slice(24).map(actor => actor.external)]);
    expect(rows, JSON.stringify(messages)).toHaveLength(32); expect(new Set(rows.map(row => row.passenger_id)).size).toBe(32);
  });
  scenario('deduplicates 24 simultaneous app/proxy copies with one transport and order identity', async () => {
    const actor = passengers[0]!, q = await quote(actor), key = randomUUID(), requestId = 'race-' + randomUUID();
    const replies = await drain(Array.from({ length: 24 }, (_, i) => submit(actor, q, key, i % 2 ? proxy : primary, actor.device, requestId)));
    expect(replies.every(reply => reply.status === 201)).toBe(true); expect(new Set(replies.map(reply => reply.data?.id)).size).toBe(1);
    await oneOrder(actor); expect(await events(replies[0]!.data!, 'order.created')).toBe(1);
  });
  scenario('allows one active order when app and both ordinary bots submit different requests', async () => {
    const actor = passengers[0]!, vk = await seedDraft(actor, 'vk'), max = await seedDraft(actor, 'max');
    await drain([booking(actor, 'vk', vk.draft.id), booking(actor, 'max', max.draft.id), ...Array.from({ length: 16 }, (_, i) => submit(actor, vk.q, randomUUID(), i % 2 ? proxy : primary).then(() => undefined))]);
    await oneOrder(actor); const rows = await ownedOrders(); expect(await events({ id: rows[0]!.id } as RideOrder, 'order.created')).toBe(1);
  });
  scenario('deduplicates repeated delivery and repeated clicks on a bot confirmation', async () => {
    const actor = passengers[0]!, { draft } = await seedDraft(actor, 'vk'), event = randomUUID();
    await drain(Array.from({ length: 16 }, (_, i) => booking(actor, 'vk', draft.id, i < 8 ? event : randomUUID())));
    await oneOrder(actor);
    const [rows] = await db.query<RowDataPacket[]>('SELECT COUNT(*) total FROM messenger_booking_events WHERE provider=? AND external_user_id=? AND event_id=?', ['vk', actor.external, event]);
    expect(Number(rows[0]!.total)).toBe(1);
  });
  scenario('prevents simultaneous accounts sharing one device from creating several active rides', async () => {
    const actors = passengers.slice(0, 12), quotes = await drain(actors.map(actor => quote(actor)));
    const replies = await drain(actors.map((actor, i) => submit(actor, quotes[i]!, randomUUID(), i % 2 ? proxy : primary, 'race-shared-device-001')));
    expect(replies.filter(reply => reply.status === 201)).toHaveLength(1); expect(await ownedOrders()).toHaveLength(1);
  });
  scenario('keeps users separate even when 12 clients reuse the same operation and idempotency keys', async () => {
    const actors = passengers.slice(0, 12), quotes = await drain(actors.map(actor => quote(actor))), key = randomUUID(), operation = 'common-' + randomUUID();
    const replies = await drain(actors.map((actor, i) => submit(actor, quotes[i]!, key, i % 2 ? proxy : primary, actor.device, operation)));
    expect(replies.every((reply, i) => reply.status === 201 && reply.data?.passengerId === actors[i]!.id)).toBe(true);
    expect(new Set(replies.map(reply => reply.data?.id)).size).toBe(12);
  });
  scenario('assigns one order to exactly one of 12 drivers competing from app and three bots', async () => {
    const order = await create(passengers[0]!);
    const replies = await drain(drivers.slice(0, 12).map((actor, i) => mixedAccept(actor, order, i)));
    expect(replies.filter(reply => reply.ok)).toHaveLength(1); expect(await events(order, 'order.accepted')).toBe(1);
    const current = (await api(passengers[0]!, '/v1/orders/' + order.id)).data!;
    expect(current.driverId).toBe(replies.find(reply => reply.ok)!.driverId);
  });
  scenario('returns the owned order on repeated app/bot acceptance instead of a false taken error', async () => {
    const order = await create(passengers[0]!), driver = drivers[0]!;
    const replies = await drain(Array.from({ length: 12 }, (_, i) => mixedAccept(driver, order, i)));
    expect(replies.every(reply => reply.ok)).toBe(true); expect(await events(order, 'order.accepted')).toBe(1);
  });
  scenario('keeps one current and one next ride when one driver accepts eight orders at once', async () => {
    const orders = await drain(passengers.slice(0, 8).map(actor => create(actor)));
    const replies = await drain(orders.map((order, i) => mixedAccept(drivers[0]!, order, i)));
    expect(replies.filter(reply => reply.ok)).toHaveLength(2);
    const assigned = (await ownedOrders()).filter(row => row.driver_id === drivers[0]!.driverId);
    expect(assigned).toHaveLength(2); expect(assigned.filter(row => row.active_driver_id != null)).toHaveLength(1);
  });
  scenario('fills 12 orders across six competing app/bot drivers without exceeding two rides each', async () => {
    const orders = await drain(passengers.slice(0, 12).map(actor => create(actor)));
    await drain(orders.flatMap((order, orderIndex) => drivers.slice(0, 6).map((driver, i) => mixedAccept(driver, order, i + orderIndex))));
    const assigned = (await ownedOrders()).filter(row => row.driver_id != null); expect(assigned).toHaveLength(12);
    for (const driver of drivers.slice(0, 6)) { const rows = assigned.filter(row => row.driver_id === driver.driverId); expect(rows).toHaveLength(2); expect(rows.filter(row => row.active_driver_id != null)).toHaveLength(1); }
  });
  scenario('does not resurrect cancelled orders while 12 app/bot drivers accept', async () => {
    for (let round = 0; round < 6; round++) {
      const actor = passengers[round]!, order = await create(actor);
      const socket = await socketFor(actor), statuses: string[] = [];
      socket.on('order:updated', (ride: RideOrder) => { if (ride.id === order.id) statuses.push(ride.status); });
      try {
        await drain([bot(actor, order, 'cancel-confirm', 'vk').then(() => undefined), ...drivers.slice(0, 12).map((driver, i) => mixedAccept(driver, order, i).then(() => undefined))]);
        const current = (await api(actor, '/v1/orders/' + order.id)).data!; expect(current.status).toBe('cancelled');
        expect(await events(order, 'order.accepted')).toBeLessThanOrEqual(1);
        await socket.timeout(5000).emitWithAck('__qa:flush'); expect(statuses.at(-1)).toBe('cancelled');
      } finally { socket.disconnect(); }
    }
  });
  scenario('counts one cancellation when the passenger app and bot repeat it 16 times', async () => {
    const actor = passengers[0]!, order = await create(actor);
    await drain(Array.from({ length: 16 }, (_, i) => i % 2 ? bot(actor, order, 'cancel-confirm', 'vk').then(() => undefined) : api(actor, `/v1/orders/${order.id}/cancel`, {}).then(() => undefined)));
    expect((await api(actor, '/v1/orders/' + order.id)).data!.status).toBe('cancelled');
    const [rows] = await db.query<RowDataPacket[]>('SELECT order_blocked_until FROM users WHERE id=?', [actor.id]); expect(rows[0]!.order_blocked_until).toBeNull();
    const [cancelled] = await db.query<RowDataPacket[]>("SELECT COUNT(*) total FROM order_events WHERE order_id=? AND to_status='cancelled'", [order.id]); expect(Number(cancelled[0]!.total)).toBe(1);
  });
  scenario('serializes going offline against app or bot acceptance without leaving a ghost assignment', async () => {
    for (let round = 0; round < 12; round++) {
      const actor = passengers[round]!, driver = drivers[round]!, order = await create(actor);
      await drain([api(driver, '/v1/driver/status', { status: 'offline' }).then(() => undefined), mixedAccept(driver, order, round).then(() => undefined)]);
      const [rows] = await db.query<RowDataPacket[]>('SELECT d.status driver_status,o.status order_status,o.driver_id,o.active_driver_id FROM drivers d CROSS JOIN orders o WHERE d.id=? AND o.id=?', [driver.driverId, order.id]);
      if (rows[0]!.driver_id) {
        expect(rows[0]).toMatchObject({ driver_status: 'busy', order_status: 'driver_arriving', active_driver_id: driver.driverId });
      } else expect(rows[0]).toMatchObject({ driver_status: 'offline', order_status: 'searching', active_driver_id: null });
    }
  });
  scenario('serializes passenger cancellation against trip start from the driver bot', async () => {
    for (let round = 0; round < 6; round++) {
      const actor = passengers[round]!, driver = drivers[round]!, order = await create(actor);
      expect((await api(driver, `/v1/driver/orders/${order.id}/accept`, {})).status).toBe(200); await transition(driver, order, 'driver_waiting');
      await drain([api(actor, `/v1/orders/${order.id}/cancel`, {}).then(() => undefined), bot(driver, order, 'start-trip', 'vk').then(() => undefined)]);
      expect(['cancelled', 'in_progress']).toContain((await api(actor, '/v1/orders/' + order.id)).data!.status);
      const transitions = await events(order, 'order.transition', 'in_progress');
      if ((await api(actor, '/v1/orders/' + order.id)).data!.status === 'cancelled') expect(transitions).toBe(0);
    }
  });
  scenario('finishes once and promotes the next ride once across app and bot retries', async () => {
    const driver = drivers[0]!, order = await create(passengers[0]!), next = await create(passengers[1]!);
    await start(driver, order); expect((await api(driver, `/v1/driver/orders/${next.id}/accept`, {})).status).toBe(200);
    await drain(Array.from({ length: 12 }, (_, i) => i % 2 ? bot(driver, order, 'complete-confirm', 'vk').then(() => undefined) : api(driver, `/v1/driver/orders/${order.id}/transition`, { status: 'completed', paymentReceived: true }).then(() => undefined)));
    expect(await events(order, 'order.transition', 'completed')).toBe(1); expect(await events(next, 'driver.queue.promoted')).toBe(1);
    expect((await api(passengers[1]!, '/v1/orders/' + next.id)).data!.status).toBe('driver_arriving');
  });
  scenario('retains explicit payment confirmation when a bot completion wins the race first', async () => {
    const driver = drivers[0]!, order = await create(passengers[0]!); await start(driver, order);
    expect((await bot(driver, order, 'complete-confirm', 'vk')).alert).not.toBe(true);
    const confirmed = await transition(driver, order, 'completed', true);
    expect(confirmed.paymentConfirmedAt).toBeTruthy(); expect(await events(order, 'order.transition', 'completed')).toBe(1);
    const retries = await drain(Array.from({ length: 8 }, () => api(driver, `/v1/driver/orders/${order.id}/transition`, { status: 'completed', paymentReceived: true })));
    expect(retries.every(reply => reply.data?.paymentConfirmedAt === confirmed.paymentConfirmedAt)).toBe(true);
    expect(await events(order, 'order.transition', 'completed')).toBe(1);
  });
  scenario('preserves both route edits and deduplicates concurrent copies of one added stop', async () => {
    const driver = drivers[0]!, order = await create(passengers[0]!); await start(driver, order);
    const edit = (requestId: string) => api(driver, `/v1/driver/orders/${order.id}/destinations`, { address: extra, kind: 'destination', requestId });
    const first = randomUUID(); await drain(Array.from({ length: 12 }, () => edit(first)));
    expect((await api(passengers[0]!, '/v1/orders/' + order.id)).data!.destinations).toHaveLength(2);
    const edits = [{ address: { ...extra, id: 'race-extra-2', label: 'с. Грахово, ул. 50 лет Победы, 21', coordinates: { latitude: 56.0564, longitude: 51.9602 } }, kind: 'destination', requestId: randomUUID() },
      { address: { ...extra, id: 'race-extra-3', label: 'с. Грахово, ул. 50 лет Победы, 23', coordinates: { latitude: 56.0574, longitude: 51.9603 } }, kind: 'destination', requestId: randomUUID() }];
    const replies = await drain(edits.map(edit => api(driver, `/v1/driver/orders/${order.id}/destinations`, edit)));
    for (let i = 0; i < replies.length; i++) {
      expect([200, 409]).toContain(replies[i]!.status);
      if (replies[i]!.status === 409) expect((await api(driver, `/v1/driver/orders/${order.id}/destinations`, edits[i])).status).toBe(200);
    }
    expect((await api(passengers[0]!, '/v1/orders/' + order.id)).data!.destinations).toHaveLength(4);
  });
  scenario('does not duplicate chat messages or mix simultaneous passenger conversations', async () => {
    const orders = await drain(passengers.slice(0, 2).map(actor => create(actor))); await drain(orders.map((order, i) => start(drivers[i]!, order)));
    const id = randomUUID(); const posts = await drain(Array.from({ length: 12 }, (_, i) => api<RideChatMessage>(passengers[0]!, `/v1/orders/${orders[0]!.id}/messages`, { id, body: 'race unique message' }, i % 2 ? proxy : primary)));
    expect(new Set(posts.map(post => post.data?.id)).size).toBe(1);
    const other = await api(drivers[1]!, `/v1/orders/${orders[0]!.id}/messages`); expect(other.status).toBe(403);
    const [rows] = await db.query<RowDataPacket[]>('SELECT COUNT(*) total FROM ride_chat_messages WHERE order_id=?', [orders[0]!.id]); expect(Number(rows[0]!.total)).toBe(1);
  });
  scenario('keeps 16 unrelated bot ratings independent instead of sharing one loopback limit', async () => {
    const actors = passengers.slice(0, 16), orders = await drain(actors.map(actor => create(actor)));
    await drain(orders.map((order, i) => start(drivers[i]!, order)));
    await drain(orders.map((order, i) => transition(drivers[i]!, order, 'completed', true)));
    const rated = await drain(orders.map((order, i) => bot(actors[i]!, order, 'rate-5', (['vk', 'max', 'telegram'] as const)[i % 3])));
    expect(rated.filter(item => item.alert), JSON.stringify(rated.filter(item => item.alert).map(item => item.text))).toHaveLength(0);
  });
  scenario('aggregates 16 simultaneous ratings of one driver without lost votes or deadlocks', async () => {
    const driver = drivers[0]!, actors = passengers.slice(0, 16);
    const orders = await drain(actors.map(actor => completedFixture(actor, driver)));
    const rated = await drain(orders.map((order, i) => bot(actors[i]!, order, `rate-${i % 5 + 1}` as RideMessengerAction, (['vk', 'max', 'telegram'] as const)[i % 3])));
    expect(rated.filter(item => item.alert), JSON.stringify(rated.filter(item => item.alert).map(item => item.text))).toHaveLength(0);
    const [rows] = await db.query<RowDataPacket[]>('SELECT rating,rating_count FROM drivers WHERE id=?', [driver.driverId]);
    expect(Number(rows[0]!.rating_count)).toBe(16); expect(Number(rows[0]!.rating)).toBeCloseTo(2.88, 2);
  });
  scenario('aggregates 16 simultaneous ratings of one passenger without FK lock-upgrade failures', async () => {
    const passenger = passengers[0]!, actors = drivers.slice(0, 16);
    const orders = await drain(actors.map(actor => completedFixture(passenger, actor)));
    const rated = await drain(orders.map((order, i) => bot(actors[i]!, order, `rate-${i % 5 + 1}` as RideMessengerAction, (['vk', 'max', 'telegram'] as const)[i % 3])));
    expect(rated.filter(item => item.alert), JSON.stringify(rated.filter(item => item.alert).map(item => item.text))).toHaveLength(0);
    const [rows] = await db.query<RowDataPacket[]>('SELECT rating,rating_count FROM users WHERE id=?', [passenger.id]);
    expect(Number(rows[0]!.rating_count)).toBe(16); expect(Number(rows[0]!.rating)).toBeCloseTo(2.88, 2);
  });
  scenario('requires scheduled-time confirmation even during competing bot and app accept requests', async () => {
    const actor = passengers[0]!, time = new Date(Math.ceil((Date.now() + 2 * 60 * 60_000) / 60_000) * 60_000).toISOString();
    const order = await create(actor, time);
    const bots = await drain(drivers.slice(0, 6).map((driver, i) => bot(driver, order, 'accept', i % 2 ? 'max' : 'vk')));
    expect(bots.every(item => item.alert)).toBe(true);
    const accepted = await drain(drivers.slice(0, 12).map(driver => api(driver, `/v1/driver/orders/${order.id}/accept`, { confirmedScheduledAt: time })));
    expect(accepted.filter(item => item.status === 200)).toHaveLength(1); expect(await events(order, 'order.accepted')).toBe(1);
  });
  scenario('starts and settles paid waiting once across app and ordinary bot retries', async () => {
    const driver = drivers[0]!, order = await create(passengers[0]!); await start(driver, order);
    await drain(Array.from({ length: 12 }, (_, i) => i % 2 ? bot(driver, order, 'waiting-start', 'vk').then(() => undefined) : api(driver, `/v1/driver/orders/${order.id}/waiting/start`, {}).then(() => undefined)));
    expect(await events(order, 'waiting.started')).toBe(1);
    await db.execute('UPDATE orders SET waiting_started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 330 SECOND) WHERE id=?', [order.id]);
    await drain(Array.from({ length: 12 }, (_, i) => i % 2 ? bot(driver, order, 'waiting-stop', 'max').then(() => undefined) : api(driver, `/v1/driver/orders/${order.id}/waiting/stop`, {}).then(() => undefined)));
    const current = (await api(passengers[0]!, '/v1/orders/' + order.id)).data!;
    expect(current.waitingStartedAt).toBeUndefined(); expect(current.waitingSeconds).toBeGreaterThanOrEqual(330); expect(current.waitingSeconds).toBeLessThan(335);
    expect(current.waitingPriceMinor).toBeGreaterThan(0); expect(await events(order, 'waiting.stopped')).toBe(1);
    const repeated = (await api(driver, `/v1/driver/orders/${order.id}/waiting/stop`, {})).data!;
    expect(repeated.priceMinor).toBe(current.priceMinor); expect(repeated.waitingSeconds).toBe(current.waitingSeconds);
  });
  scenario('applies one search-price increase when app choices and bot confirmations race', async () => {
    const actor = passengers[0]!, order = await create(actor);
    await db.execute('UPDATE orders SET created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE), search_price_increase_interval_minutes=4 WHERE id=?', [order.id]);
    const increase = searchPriceIncreaseChoices(order.priceMinor)[0]!;
    await drain(Array.from({ length: 12 }, (_, i) => i % 2 ? bot(actor, order, 'increase-confirm', 'vk').then(() => undefined)
      : api(actor, `/v1/orders/${order.id}/search-price-increase`, { choice: { expectedPriceMinor: order.priceMinor, increaseMinor: increase } }).then(() => undefined)));
    const current = (await api(actor, '/v1/orders/' + order.id)).data!;
    expect([increase, order.searchPriceIncreaseStepMinor]).toContain(current.priceMinor - order.priceMinor);
    const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) total FROM order_events WHERE order_id=? AND event_type LIKE '%price%increase%'", [order.id]);
    expect(Number(rows[0]!.total)).toBe(1);
  });
  scenario('keeps completion and queued-passenger cancellation consistent when app and bots race', async () => {
    for (let round = 0; round < 6; round++) {
      const driver = drivers[round]!, order = await create(passengers[round * 2]!), next = await create(passengers[round * 2 + 1]!);
      await start(driver, order); expect((await api(driver, `/v1/driver/orders/${next.id}/accept`, {})).status).toBe(200);
      await drain([bot(driver, order, 'complete-confirm', 'vk').then(() => undefined), bot(passengers[round * 2 + 1]!, next, 'cancel-confirm', 'max').then(() => undefined)]);
      expect((await api(passengers[round * 2]!, '/v1/orders/' + order.id)).data!.status).toBe('completed');
      expect((await api(passengers[round * 2 + 1]!, '/v1/orders/' + next.id)).data!.status).toBe('cancelled');
      const [active] = await db.query<RowDataPacket[]>('SELECT id FROM orders WHERE active_driver_id=?', [driver.driverId]); expect(active).toHaveLength(0);
    }
  });
  scenario('allows only one of two overlapping preorders accepted concurrently by one driver', async () => {
    const time = new Date(Math.ceil((Date.now() + 2 * 60 * 60_000) / 60_000) * 60_000).toISOString();
    const orders = await drain(passengers.slice(0, 2).map(actor => create(actor, time)));
    const replies = await drain(orders.map(order => api(drivers[0]!, `/v1/driver/orders/${order.id}/accept`, { confirmedScheduledAt: time })));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(1);
  });
  scenario('deduplicates a lost app response across real VK/MAX then arbitrates three contending accept transports', async () => {
    const clients = await realClients(), actor = passengers[0]!, q = await quote(actor), key = randomUUID(), requestId = 'real-race-' + randomUUID();
    const body = { pickup, destination, tariff: 'economy', paymentMethod: 'cash', quoteToken: q.quoteToken, idempotencyKey: key, deviceId: actor.device, legalAcceptance: currentInitialLegalAcceptance() };
    await fetch(primary + '/__test/fault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"dropNextResponse":true}' });
    const lostApp = async () => {
      let lost = false;
      try { await fetch(primary + '/v1/orders', { method: 'POST', headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json', 'X-Taxi-Request-Id': requestId }, body: JSON.stringify(body) }); } catch { lost = true; }
      expect(lost).toBe(true); return api(actor, '/v1/orders', body, proxy, requestId);
    };
    const request = { method: 'POST', path: '/v1/orders', token: actor.token, body: JSON.stringify(body), requestId };
    const [app, vk, max] = await drain([lostApp(), clients.vk.request(request).then(response => ({ status: response.status, ...JSON.parse(response.body) } as Result)), clients.max.request(request).then(response => ({ status: response.status, ...JSON.parse(response.body) } as Result))]);
    if (!app || !vk || !max) throw new Error('Missing transport response');
    expect([app.status, vk.status, max.status]).toEqual([201, 201, 201]); expect(new Set([app.data!.id, vk.data!.id, max.data!.id]).size).toBe(1);
    const order = app.data!; await oneOrder(actor); expect(await events(order, 'order.created')).toBe(1);
    const lock = await mysql.createConnection({ uri: database, timezone: 'Z' }); await lock.beginTransaction();
    await lock.query('SELECT id FROM orders WHERE id=? FOR UPDATE', [order.id]);
    const acceptPath = `/v1/driver/orders/${order.id}/accept`;
    const pending = Promise.allSettled([
      api(drivers[0]!, acceptPath, {}),
      clients.vk.request({ method: 'POST', path: acceptPath, token: drivers[1]!.token, body: '{}', requestId: 'vk-accept-' + randomUUID() }).then(response => ({ status: response.status, ...JSON.parse(response.body) } as Result)),
      clients.max.request({ method: 'POST', path: acceptPath, token: drivers[2]!.token, body: '{}', requestId: 'max-accept-' + randomUUID() }).then(response => ({ status: response.status, ...JSON.parse(response.body) } as Result)),
    ]);
    try {
      const deadline = Date.now() + 10_000; let arrived = 0;
      while (Date.now() < deadline) { const metrics = await (await fetch(origin + '/__qa/metrics')).json(); arrived = metrics.data['POST ' + acceptPath] ?? 0; if (arrived >= 3) break; await new Promise(resolve => setTimeout(resolve, 75)); }
      expect(arrived).toBe(3); await lock.commit();
      const settled = await pending; const rejected = settled.find(item => item.status === 'rejected'); if (rejected?.status === 'rejected') throw rejected.reason;
      const replies = settled.map(item => (item as PromiseFulfilledResult<Result>).value);
      expect(replies.filter(reply => reply.status === 200)).toHaveLength(1); expect(replies.filter(reply => reply.status === 409)).toHaveLength(2);
      expect(await events(order, 'order.accepted')).toBe(1);
      const current = (await api(actor, '/v1/orders/' + order.id)).data!, winner = drivers.find(driver => driver.driverId === current.driverId)!;
      await transition(winner, current, 'driver_waiting'); await transition(winner, current, 'in_progress'); await transition(winner, current, 'completed', true);
      expect((await api(actor, '/v1/orders/' + order.id)).data!.paymentConfirmedAt).toBeTruthy();
    } finally { await lock.rollback(); await lock.end(); await pending; }
  }, 90_000);
});
