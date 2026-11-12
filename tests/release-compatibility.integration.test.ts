import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { io, type Socket } from 'socket.io-client';
import dotenv from 'dotenv';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RideOrder, RideChatThread, RideChatMessage } from '../src/domain/models';
import type { ReserveClient } from '../src/api/reserve-coordinator';
import { currentInitialLegalAcceptance } from '../src/legal/documents';

const channels = vi.hoisted(() => ({ clients: [] as ReserveClient[] }));
vi.mock('../src/api/reserve-config', () => ({
  reserveChannelsEnabled: () => channels.clients.length > 0,
  getReserveClients: () => channels.clients,
}));
const enabled = process.env.RUN_RELEASE_COMPATIBILITY === '1';
const origin = 'http://127.0.0.1:4220', primary = 'http://127.0.0.1:4221', proxy = 'http://127.0.0.1:4225';
const database = 'mysql://root@127.0.0.1:3312/taxi_qa_transport_recheck_20261112';
type Session = { token: string; user: { id: string; roles: string[] } };
type Api = { apiRequest<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> };
type Result = { scenario: string; checks: string[] };
let db: mysql.Connection, sessions: Session[];
const results: Result[] = [], created = new Set<string>(), sockets: Socket[] = [];
let stopRelay: (() => Promise<void>) | undefined;
const pickup = { id: 'compat-a', label: 'с. Грахово, ул. Ачинцева, 5', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const destination = { id: 'compat-b', label: 'с. Грахово, ул. Колпакова, 1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } };
const extra = { id: 'compat-c', label: 'с. Грахово, ул. 50 лет Победы, 19', coordinates: { latitude: 56.055332, longitude: 51.960263 } };
const post = (token: string, body: unknown = {}) => ({ method: 'POST', token, body: JSON.stringify(body) });
async function fault(base: string, offline: boolean) {
  const response = await fetch(base + '/__test/fault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline, hang: false, dropNextResponse: false }) });
  expect(response.ok).toBe(true);
}
async function legacy(version: string): Promise<Api> {
  return import(/* @vite-ignore */ pathToFileURL(`D:/taxi-compatibility-lab-20261112/legacy-client-${version}.mjs`).href);
}
async function current(): Promise<Api> { return import('../src/api/client'); }
async function socketFor(session: Session) {
  const socket = io(origin, { auth: { token: session.token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
async function createRide(api: Api, passenger: Session, scheduledAt?: string) {
  const quote = await api.apiRequest<{ quoteToken: string }>('/v1/quotes', post(passenger.token, { pickup, destination, scheduledAt }));
  const order = await api.apiRequest<RideOrder>('/v1/orders', post(passenger.token, {
    pickup, destination, ...(scheduledAt ? { scheduledAt } : {}), tariff: 'economy', paymentMethod: 'cash',
    quoteToken: quote.quoteToken, idempotencyKey: 'release-compat-' + randomUUID(),
    deviceId: 'release-compat-device-001', legalAcceptance: currentInitialLegalAcceptance(),
  }));
  created.add(order.id);
  expect(order.status).toBe('searching');
  return order;
}
async function completeCycle(passengerApi: Api, driverApi: Api, passenger = sessions[0]!, extras = false) {
  const driver = sessions[1]!, admin = sessions[2]!;
  await driverApi.apiRequest('/v1/driver/status', post(driver.token, { status: 'online' }));
  const order = await createRide(passengerApi, passenger);
  const offers = await driverApi.apiRequest<RideOrder[]>('/v1/driver/offers', { token: driver.token, cache: 'no-store' });
  expect(offers.some(offer => offer.id === order.id)).toBe(true);
  const accepted = await driverApi.apiRequest<RideOrder>(`/v1/driver/orders/${order.id}/accept`, post(driver.token));
  expect(accepted.status).toBe('driver_arriving');
  const message = await passengerApi.apiRequest<RideChatMessage>(`/v1/orders/${order.id}/messages`, post(passenger.token, { id: randomUUID(), body: 'Тест совместимости пассажира' }));
  const reply = await driverApi.apiRequest<RideChatMessage>(`/v1/orders/${order.id}/messages`, post(driver.token, { id: randomUUID(), body: 'Тест совместимости водителя' }));
  const passengerThread = await passengerApi.apiRequest<RideChatThread>(`/v1/orders/${order.id}/messages`, { token: passenger.token, cache: 'no-store' });
  expect(passengerThread.messages.map(item => item.id)).toEqual([message.id, reply.id]);
  await passengerApi.apiRequest(`/v1/orders/${order.id}/messages/read`, post(passenger.token));
  await driverApi.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'driver_waiting' }));
  await driverApi.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'in_progress' }));
  if (extras) {
    await driverApi.apiRequest(`/v1/driver/orders/${order.id}/waiting/start`, post(driver.token));
    await db.execute('UPDATE orders SET waiting_started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 330 SECOND) WHERE id = ?', [order.id]);
    const waited = await driverApi.apiRequest<RideOrder>(`/v1/driver/orders/${order.id}/waiting/stop`, post(driver.token));
    expect(waited.waitingPriceMinor).toBeGreaterThan(0);
    const changed = await driverApi.apiRequest<RideOrder>(`/v1/driver/orders/${order.id}/destinations`, post(driver.token, { address: extra, kind: 'destination', requestId: randomUUID() }));
    expect(changed.priceMinor).toBeGreaterThan(waited.priceMinor);
    const visible = await passengerApi.apiRequest<RideOrder>(`/v1/orders/${order.id}`, { token: passenger.token, cache: 'no-store' });
    expect(visible.priceMinor).toBe(changed.priceMinor);
    expect(visible.destinations).toHaveLength(2);
    await driverApi.apiRequest(`/v1/driver/orders/${order.id}/stops/complete`, post(driver.token, { destinationIndex: 0 }));
  }
  const completed = await driverApi.apiRequest<RideOrder>(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'completed', paymentReceived: true }));
  expect(completed.status).toBe('completed');
  expect(completed.paymentConfirmedAt).toBeTruthy();
  await passengerApi.apiRequest(`/v1/orders/${order.id}/rating`, post(passenger.token, { score: 5 }));
  await driverApi.apiRequest(`/v1/orders/${order.id}/rating`, post(driver.token, { score: 4 }));
  const history = await passengerApi.apiRequest<RideOrder[]>(`/v1/orders?scope=passenger&limit=20`, { token: passenger.token, cache: 'no-store' });
  expect(history.some(item => item.id === order.id && item.status === 'completed')).toBe(true);
  const adminApi = await current();
  const adminOrder = await adminApi.apiRequest<RideOrder>(`/v1/orders/${order.id}`, { token: admin.token, cache: 'no-store' });
  expect(adminOrder.status).toBe('completed');
  const [rows] = await db.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS total FROM orders WHERE id = ?', [order.id]);
  expect(Number(rows[0]!.total)).toBe(1);
  return ['quote', 'search', 'offer', 'accept', 'two-way chat', 'read receipt', 'arrival', 'start', ...(extras ? ['paid waiting', 'added stop', 'price seen by passenger'] : []), 'complete', 'payment', 'two ratings', 'passenger history', 'admin view', 'one SQL order'];
}
async function startRealRelay(name: 'vk' | 'max') {
  const { startBotApiRelay } = await import('../server/bot-api-relay');
  const { VkBotTransport } = await import('../src/api/vk-bot-transport');
  const { VkRelayClient } = await import('../src/api/vk-relay-client');
  const { MaxBotTransport } = await import('../src/api/max-bot-transport');
  const { MaxRelayClient } = await import('../src/api/max-relay-client');
  const env: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) Object.assign(env, dotenv.parse(await readFile(file)));
  const runtime = JSON.parse(await readFile('tmp/max-app-runtime.json', 'utf8'));
  const service = JSON.parse(await readFile('tmp/vk-relay-service-account.json', 'utf8'));
  expect(service.userId).toBe('33610634');
  expect(env.VK_COMMUNITY_ID).toBe('193790756');
  const common = { channel: runtime.channel, publicKey: runtime.publicKey };
  const max = { botToken: runtime.botToken, chatId: runtime.chatId, serviceUserId: runtime.serviceUserId };
  const vk = { botToken: env.VK_BOT_TOKEN!, groupId: env.VK_COMMUNITY_ID!, serviceUserId: service.userId };
  const api = name === 'vk' ? new VkBotTransport({ token: vk.botToken, groupId: vk.groupId, serviceUserId: vk.serviceUserId })
    : new MaxBotTransport({ token: max.botToken, chatId: max.chatId, serviceUserId: max.serviceUserId });
  const client = name === 'vk' ? new VkRelayClient({ ...common, ...vk }) : new MaxRelayClient({ ...common, ...max });
  channels.clients = [{ name, client }];
  const app = { hasRoute: () => true, log: { warn: () => {} }, inject: async (options: { url: string; method: string; headers: HeadersInit; payload?: string; remoteAddress?: string }) => {
    const headers = new Headers(options.headers);
    // The local production-mode backend trusts one loopback hop, just as nginx.
    if (options.remoteAddress) headers.set('X-Forwarded-For', options.remoteAddress);
    const response = await fetch(origin + options.url, { method: options.method, headers, body: options.payload });
    return { statusCode: response.status, body: await response.text() };
  } } as unknown as FastifyInstance;
  stopRelay = await startBotApiRelay(app, { api, label: name === 'vk' ? 'VK' : 'MAX', recipientId: name === 'vk' ? vk.serviceUserId : max.chatId, channel: runtime.channel, secretKey: runtime.secretKey });
}
describe.skipIf(!enabled)('published-client compatibility and complete release cycles', () => {
  beforeAll(async () => {
    expect(new URL(database).pathname).toMatch(/^\/taxi_qa_/);
    sessions = JSON.parse(await readFile('tmp/max-app-sessions.json', 'utf8')).sessions;
    db = await mysql.createConnection({ uri: database, timezone: 'Z' });
    expect((await fetch(origin + '/health/ready')).status).toBe(200);
  });
  beforeEach(async () => {
    channels.clients = [];
    vi.stubEnv('EXPO_OS', 'web'); vi.stubEnv('EXPO_PUBLIC_API_URL', primary); vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL', proxy + '/taxigr');
    await fault(primary, false); await fault(proxy, false);
    await db.execute('UPDATE users SET order_blocked_until=NULL, order_block_reason=NULL WHERE id IN (?,?,?)', sessions.map(item => item.user.id));
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await stopRelay?.(); stopRelay = undefined;
    await fault(primary, false); await fault(proxy, false);
    for (const id of created) await db.execute('DELETE FROM orders WHERE id=? AND passenger_id IN (?,?,?)', [id, ...sessions.map(item => item.user.id)]);
    created.clear(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules();
  });
  afterAll(async () => {
    await db.end(); await mkdir('artifacts/release-compatibility-2026-11-12', { recursive: true });
    await writeFile('artifacts/release-compatibility-2026-11-12/full-cycles.json', JSON.stringify({ productionMutations: false, results }, null, 2));
  });
  it.each(['1.0.25', '1.0.28'])('completes an unmodified %s API client cycle without requiring new headers', async version => {
    const client = await legacy(version), original = globalThis.fetch;
    const legacyHeaders: (string | null)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).startsWith(origin) && !['GET', 'HEAD'].includes(options?.method ?? 'GET')) legacyHeaders.push(new Headers(options?.headers).get('X-Taxi-Request-Id'));
      return original(url, options);
    });
    const observer = await socketFor(sessions[0]!); const received: string[] = [];
    observer.on('order:updated', (order: RideOrder) => received.push(order.status));
    const checks = await completeCycle(client, client, sessions[0]!, version === '1.0.28');
    expect(legacyHeaders.length).toBeGreaterThan(8); expect(legacyHeaders.every(value => value === null)).toBe(true);
    expect(received).toContain('driver_arriving'); expect(received).toContain('completed');
    results.push({ scenario: 'legacy-' + version + '-both-roles', checks: [...checks, 'no new transport header', 'old Socket.IO events'] });
  }, 30_000);
  it.each(['old-passenger', 'old-driver'])('completes a mixed-version cycle with an %s', async side => {
    const old = await legacy('1.0.25'), modern = await current();
    results.push({ scenario: 'mixed-' + side, checks: await completeCycle(side === 'old-passenger' ? old : modern, side === 'old-driver' ? old : modern, sessions[0]!, true) });
  }, 30_000);
  it('completes a scheduled ride with the 1.0.28 client and the modern driver', async () => {
    const old = await legacy('1.0.28'), modern = await current(), passenger = sessions[0]!, driver = sessions[1]!;
    await modern.apiRequest('/v1/driver/status', post(driver.token, { status: 'online' }));
    const scheduledAt = new Date(Math.ceil((Date.now() + 2 * 60 * 60_000) / 60_000) * 60_000).toISOString();
    const order = await createRide(old, passenger, scheduledAt);
    await expect(modern.apiRequest(`/v1/driver/orders/${order.id}/accept`, post(driver.token))).rejects.toMatchObject({ status: 409, code: 'SCHEDULE_CONFIRMATION_REQUIRED' });
    await modern.apiRequest(`/v1/driver/orders/${order.id}/accept`, post(driver.token, { confirmedScheduledAt: scheduledAt }));
    await expect(modern.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'driver_arriving' }))).rejects.toMatchObject({ code: 'PREORDER_DEPARTURE_TOO_EARLY' });
    // Advance only this synthetic preorder into the permitted departure window.
    const near = new Date(Math.floor((Date.now() + 5 * 60_000) / 60_000) * 60_000);
    await db.execute('UPDATE orders SET scheduled_at=? WHERE id=?', [near, order.id]);
    await modern.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'driver_arriving' }));
    await modern.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'driver_waiting' }));
    await modern.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'in_progress' }));
    await modern.apiRequest(`/v1/driver/orders/${order.id}/transition`, post(driver.token, { status: 'completed', paymentReceived: true }));
    const seen = await old.apiRequest<RideOrder>(`/v1/orders/${order.id}`, { token: passenger.token, cache: 'no-store' });
    expect(seen.status).toBe('completed'); expect(seen.scheduledAt).toBe(near.toISOString());
    results.push({ scenario: 'legacy-1.0.28-scheduled-full-cycle', checks: ['time retained', 'confirmation required', 'early departure denied', 'departure in allowed window', 'accept', 'arrive', 'start', 'complete', 'old passenger sees completion'] });
  }, 30_000);
  it.each(['vk', 'max'] as const)('completes a real %s-only cycle after both HTTP paths fail', async name => {
    await startRealRelay(name); await fault(primary, true); await fault(proxy, true);
    const api = await current();
    const passenger = name === 'max' ? sessions[2]! : sessions[0]!;
    const checks = await completeCycle(api, api, passenger);
    expect((await import('../src/api/api-channel')).getApiChannel()).toBe(name);
    results.push({ scenario: name + '-only-full-cycle' + (name === 'max' ? '-superadmin-passenger' : ''), checks: [...checks, 'both HTTP paths disabled', 'real approved service dialog'] });
  }, 180_000);
});
