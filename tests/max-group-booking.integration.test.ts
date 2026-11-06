import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { currentInitialLegalAcceptance } from '../src/legal/documents';
import { config } from '../server/config';
import { db, withTransaction } from '../server/db';
import { recordInitialConsents } from '../server/legal';
import { registerRoutes } from '../server/routes';
import { sha256, signSession } from '../server/security';

const scope = vi.hoisted(() => ({ device: 'fd34fb7f-7447-481a-9924-9b30df5526ac', account: '10000101' }));
vi.mock('../server/config', async original => {
  const actual = await original<typeof import('../server/config')>();
  return { ...actual, config: { ...actual.config, MAX_GROUP_BOOKING_DEVICE_ID: scope.device, MAX_GROUP_BOOKING_ACCOUNT_ID: scope.account,
    BOT_AI_API_KEY: '', ROUTER_BASE_URL: '', MAX_BOT_TOKEN: '', VK_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: '', EXPO_ACCESS_TOKEN: '' } };
});

describe.skipIf(process.env.RUN_GROUP_ALERT_INTEGRATION !== '1')('MAX personal booking with the real order API', () => {
  const app = Fastify();
  const owner = randomUUID(), passenger = randomUUID(), driver = randomUUID(), driverId = randomUUID();
  const senderId = '10000203', unlinked = '10000204', groupId = '98870000';
  const token = 'a'.repeat(43);
  const route = '/v1/group-alerts/max-booking';
  let driverToken: string, passengerToken: string;
  const post = (url: string, authorization: string, payload: object) => app.inject({
    method: 'POST', url, headers: { authorization: `Bearer ${authorization}` }, payload,
  });
  const ask = (input: object) => post(route, token, { accountId: scope.account, ...input });
  const event = (author = senderId, text = 'Кто таксует?') => ({
    eventId: sha256(randomUUID()), provider: 'max', groupId, groupTitle: 'Такси 🚖 Грахово', senderId: author, text, sentAt: Date.now(),
  });
  const message = (text: string, sender = senderId) => ({
    action: 'message', text, senderId: sender, eventId: sha256(randomUUID()), sentAt: Date.now(),
  });
  async function addressQuote(text: string, sender: string) {
    let reply = await ask(message(text, sender));
    for (let step = 0; step < 2 && /^(Откуда|Куда) именно\?/u.test(reply.json().data?.text ?? ''); step++) {
      expect(reply.json().data.text).toMatch(/\n1\. /u);
      reply = await ask(message('1', sender));
    }
    return reply;
  }
  beforeAll(async () => {
    const target = new URL(config.MYSQL_URL);
    if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/^\/taxi_(qa|test)_/u.test(target.pathname)) throw new Error('Use a local isolated database');
    await registerRoutes(app, () => {}, { disconnectUser() {} });
    await app.ready();
    await db.execute('UPDATE booking_settings SET enabled = 1 WHERE id = 1');
    for (const [id, phone, role] of [[owner, null, 'admin'], [passenger, '+79090001231', 'passenger'], [driver, '+79090001232', 'driver']] as const) {
      await db.execute("INSERT INTO users (id, name, phone, phone_verified_at, gender, profile_completed_at) VALUES (?, 'QA MAX', ?, UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3))", [id, phone]);
      await db.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [id, role]);
    }
    await db.execute("INSERT INTO drivers (id,user_id,status,has_child_seat) VALUES (?, ?, 'online', TRUE)", [driverId, driver]);
    await db.execute("INSERT INTO vehicles (id,driver_id,make,model,year,color,color_hex,plate) VALUES (?, ?, 'Lada', 'Granta', 2024, 'Белая', '#FFFFFF', 'QA1118')", [randomUUID(), driverId]);
    await db.execute('INSERT INTO driver_locations (driver_id,latitude,longitude,accuracy_meters,recorded_at) VALUES (?, 56.046, 51.959, 8, UTC_TIMESTAMP(3))', [driverId]);
    await db.execute("INSERT INTO user_messenger_accounts (user_id,provider,external_user_id,chat_id) VALUES (?, 'max', ?, ?)", [passenger, senderId, senderId]);
    await withTransaction(connection => recordInitialConsents(connection, passenger, currentInitialLegalAcceptance(), { source: 'order_confirmation' }));
    await db.execute('INSERT INTO group_alert_devices (id,owner_id,name,groups_json,token_hash,pairing_expires_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))',
      [scope.device, owner, 'QA MAX', JSON.stringify([{ provider: 'max', id: groupId, title: 'Такси 🚖 Грахово' }]), sha256(token)]);
    driverToken = await signSession({ id: driver, roles: ['driver'] });
    passengerToken = await signSession({ id: passenger, roles: ['passenger'] });
  }, 20_000);
  afterAll(async () => {
    await app.close();
    await db.execute('DELETE FROM orders WHERE passenger_id = ?', [passenger]);
    await db.execute('DELETE FROM users WHERE id IN (?,?,?)', [owner, passenger, driver]);
    await db.end();
  });
  it('enforces collector scope, approved group, message freshness and verified passenger identity', async () => {
    expect((await ask({ action: 'poll', accountId: '10000102' })).statusCode).toBe(403);
    expect((await post(route, passengerToken, { action: 'poll', accountId: scope.account })).statusCode).toBe(401);
    for (const lead of [{ ...event(), groupId: '999' }, { ...event(), sentAt: Date.now() - 200_000 }, event(senderId, 'Кто знает расписание?')]) {
      expect((await ask({ action: 'start', event: lead })).json().data).toEqual({});
    }
    expect((await ask(message('да'))).json().data).toEqual({});
    expect((await ask({ action: 'start', event: event(unlinked) })).json().data.text).toMatch(/По селу сейчас \d+ ₽/u);
    const guest = await addressQuote('Ачинцева 5 → Можга', unlinked);
    expect(guest.statusCode, guest.body).toBe(200);
    expect(guest.json().data.text).toMatch(/г\. Можга.*Обычная цена.*подтвердите номер/u);
    const spoken = await ask(message('с кизнера нужно забрать и увезти в Мари возжай', unlinked));
    expect(spoken.statusCode, spoken.body).toBe(200);
    expect(spoken.json().data.text).toMatch(/п\. Кизнер\n2\. с\. Кизнер/u);
    const selected = await ask(message('1', unlinked));
    expect(selected.statusCode, selected.body).toBe(200);
    expect(selected.json().data.text).toMatch(/п\. Кизнер → д\. Мари-Возжай.*Обычная цена/u);
    const [orders] = await db.query<RowDataPacket[]>('SELECT id FROM orders WHERE passenger_id = ?', [passenger]);
    expect(orders).toHaveLength(0);
  });
  it('uses the real tariff and order API, stays silent until acceptance, and retries idempotently', async () => {
    const lead = { action: 'start', event: event() };
    const intro = await ask(lead);
    expect(intro.statusCode, intro.body).toBe(200);
    expect(intro.json().data.text).toMatch(/По селу сейчас \d+ ₽/u);
    expect((await ask(lead)).json().data).toEqual(intro.json().data);
    expect((await ask({ action: 'start', event: event() })).json().data).toEqual({});
    const quote = await addressQuote('Ачинцева 5 → Колпакова 1Б', senderId);
    expect(quote.statusCode, quote.body).toBe(200);
    expect(quote.json().data.text).toMatch(/Ачинцева.*Колпакова.*\d+ ₽.*Подходит/u);
    const yes = message('да, давайте');
    const confirmed = await Promise.all([ask(yes), ask(yes)]);
    expect(confirmed.map(item => item.json().data)).toEqual([{ text: null, watch: true, waiting: true }, { text: null, watch: true, waiting: true }]);
    const [rides] = await db.query<RowDataPacket[]>('SELECT id, status, price_minor FROM orders WHERE passenger_id = ?', [passenger]);
    expect(rides).toHaveLength(1);
    expect(rides[0]!.status).toBe('searching');
    expect(quote.json().data.text).toContain(`${rides[0]!.price_minor / 100} ₽`);
    expect((await ask({ action: 'poll' })).json().data.messages).toEqual([]);
    const accepted = await post(`/v1/driver/orders/${rides[0]!.id}/accept`, driverToken, {});
    expect(accepted.statusCode, accepted.body).toBe(200);
    const polled = await ask({ action: 'poll' });
    const [details] = polled.json().data.messages;
    expect(details).toMatchObject({ senderId, orderId: rides[0]!.id, driverId });
    expect(details.text).toMatch(/через \d+ мин.*Lada Granta QA1118.*\+79090001232/u);
    expect((await ask({ action: 'ack', senderId, orderId: details.orderId, driverId })).statusCode).toBe(200);
    expect((await ask({ action: 'poll' })).json().data.messages).toEqual([]);
  });
});
