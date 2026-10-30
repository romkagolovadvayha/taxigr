import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../server/messenger-notifications', () => ({ notifyMessengerAccount: send, appUrl: (path: string) => `https://taxigr.ru${path}` }));
vi.mock('../server/config', async original => {
  const actual = await original<typeof import('../server/config')>();
  return { ...actual, config: { ...actual.config, MAX_BOT_TOKEN: 'local-test', TELEGRAM_BOT_TOKEN: 'local-test' } };
});
import { config } from '../server/config';
import { db } from '../server/db';
import { deliverGroupAlerts, registerGroupAlertRoutes } from '../server/group-alerts';
import { sha256, signSession } from '../server/security';

describe.skipIf(process.env.RUN_GROUP_ALERT_INTEGRATION !== '1')('group alerts with a real isolated database', () => {
  const owner = randomUUID(), other = randomUUID(), author = randomUUID();
  const app = Fastify();
  let token: string, otherToken: string, deviceToken: string, deviceId: string;
  const phone = '+79870001234';
  const groups = [{ provider: 'whatsapp', title: 'Кто таксует?' }];
  const adminRequest = (url: string, body?: Record<string, unknown>, authorization = token) => app.inject({ method: body ? 'POST' : 'GET', url,
    headers: { authorization: `Bearer ${authorization}` }, ...(body ? { payload: body } : {}) });
  const event = (overrides: Record<string, unknown> = {}) => ({ eventId: sha256(randomUUID()), provider: 'whatsapp', groupTitle: 'Кто таксует?',
    text: 'Кто таксует? Нужно до Грахово', sentAt: Date.now(), senderName: 'Иван', ...overrides });
  const ingest = (body: Record<string, unknown>, credential = deviceToken) => app.inject({ method: 'POST', url: '/v1/group-alerts/events', headers: { authorization: `Bearer ${credential}` }, payload: body });
  beforeAll(async () => {
    if (!/\/taxi_(qa|test)_/u.test(config.MYSQL_URL)) throw new Error('Use an isolated taxi_qa_ database');
    registerGroupAlertRoutes(app);
    for (const [id, name] of [[owner, 'Администратор'], [other, 'Водитель'], [author, 'Иван Иванов Иванович']] as const) {
      await db.execute('INSERT INTO users (id, vk_id, name, phone, phone_verified_at) VALUES (?, ?, ?, ?, ?)', [id, id, name, id === author ? phone : null, id === author ? new Date() : null]);
      await db.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [id, id === owner ? 'admin' : 'passenger']);
    }
    for (const id of [owner, other]) for (const provider of ['max', 'telegram']) {
      await db.execute(`INSERT INTO user_messenger_accounts (user_id, provider, external_user_id, chat_id, notifications_enabled)
        VALUES (?, ?, ?, ?, TRUE)`, [id, provider, id + provider, id + provider]);
    }
    token = await signSession({ id: owner, roles: ['admin'] });
    otherToken = await signSession({ id: other, roles: ['passenger'] });
    await app.ready();
  });
  afterAll(async () => { await app.close(); await db.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [owner, other, author]); await db.end(); });
  it('restricts configuration and requires a live administrator role', async () => {
    expect((await app.inject('/v1/admin/group-alerts/devices')).statusCode).toBe(401);
    expect((await adminRequest('/v1/admin/group-alerts/devices', undefined, otherToken)).statusCode).toBe(403);
    const forgedRole = await signSession({ id: other, roles: ['admin'] });
    expect((await adminRequest('/v1/admin/group-alerts/devices', undefined, forgedRole)).statusCode).toBe(403);
  });
  it('pairs once, stores only a hash, and keeps the collection credential separate from admin access', async () => {
    const created = await adminRequest('/v1/admin/group-alerts/devices', { name: 'Test Android', groups });
    expect(created.statusCode, created.body).toBe(200);
    const { id, code } = created.json().data; deviceId = id;
    const paired = await app.inject({ method: 'POST', url: '/v1/group-alerts/pair', payload: { code } });
    expect(paired.statusCode, paired.body).toBe(200); deviceToken = paired.json().data.token;
    expect((await app.inject({ method: 'POST', url: '/v1/group-alerts/pair', payload: { code } })).statusCode).toBe(401);
    const [rows] = await db.query<RowDataPacket[]>('SELECT token_hash, pairing_hash FROM group_alert_devices WHERE id = ?', [id]);
    expect(rows[0]?.token_hash).toBe(sha256(deviceToken)); expect(rows[0]?.pairing_hash).toBeNull();
    expect((await adminRequest('/v1/admin/group-alerts/devices', undefined, deviceToken)).statusCode).toBe(401);
  });
  it('enforces exact group selection, request filters, timestamp bounds and strict input', async () => {
    expect((await ingest(event({ groupTitle: 'Личная переписка' }))).statusCode).toBe(403);
    expect((await ingest(event({ provider: 'max' }))).statusCode).toBe(403);
    expect((await ingest(event({ text: 'Доброе утро' }))).json().data.accepted).toBe(false);
    expect((await ingest(event({ sentAt: Date.now() - 3_700_000 }))).json().data.accepted).toBe(false);
    expect((await ingest(event({ sentAt: Date.now() + 120_000 }))).json().data.accepted).toBe(false);
    expect((await ingest(event({ recipients: ['all'] }))).statusCode).toBe(400);
  });
  it('deduplicates simultaneous notifications and enriches only a verified sender phone', async () => {
    const body = event({ senderUri: 'tel:' + phone });
    const results = await Promise.all([ingest(body), ingest(body)]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]);
    expect(results[0]!.json().data).toEqual({ accepted: true });
    const [rows] = await db.query<RowDataPacket[]>('SELECT matched_user_id FROM group_alert_events WHERE device_id = ? AND event_key = ?', [deviceId, body.eventId]);
    expect(rows).toHaveLength(1); expect(rows[0]?.matched_user_id).toBe(author);
    const second = event({ senderName: 'Иван Иванов Иванович', text: `Нужно такси, телефон ${phone}` });
    expect((await ingest(second)).statusCode).toBe(200);
    const [unknown] = await db.query<RowDataPacket[]>('SELECT matched_user_id FROM group_alert_events WHERE event_key = ?', [second.eventId]);
    expect(unknown[0]?.matched_user_id).toBeNull();
  });
  it('delivers to the owner’s enabled bots only, adds database details and does not resend successful channels', async () => {
    send.mockClear(); let failed = false;
    send.mockImplementation(async (provider: string) => { if (provider === 'max' && !failed) { failed = true; throw new Error('Transient provider error'); } });
    await deliverGroupAlerts();
    expect(send.mock.calls).toHaveLength(4);
    for (const [provider, externalId] of send.mock.calls) expect(externalId).toBe(owner + provider);
    expect(send.mock.calls.some(call => JSON.stringify(call[2]).includes(phone) && JSON.stringify(call[2]).includes('Иван Иванов Иванович'))).toBe(true);
    await db.execute(`UPDATE group_alert_deliveries q JOIN group_alert_events e ON e.id = q.event_id SET q.next_attempt_at = UTC_TIMESTAMP(3) WHERE e.device_id = ?`, [deviceId]);
    send.mockClear(); await deliverGroupAlerts();
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0]?.[0]).toBe('max');
  });
  it('rejects an expired pairing code', async () => {
    const created = (await adminRequest('/v1/admin/group-alerts/devices', { name: 'Expired', groups })).json().data;
    await db.execute('UPDATE group_alert_devices SET pairing_expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?', [created.id]);
    expect((await app.inject({ method: 'POST', url: '/v1/group-alerts/pair', payload: { code: created.code } })).statusCode).toBe(401);
  });
  it('revokes pending delivery and ingress when admin rights or device access are removed', async () => {
    expect((await ingest(event())).statusCode).toBe(200);
    await db.execute("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'", [owner]);
    expect((await ingest(event())).statusCode).toBe(401);
    send.mockClear(); await deliverGroupAlerts(); expect(send).not.toHaveBeenCalled();
    await db.execute("INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')", [owner]);
    expect((await app.inject({ method: 'DELETE', url: `/v1/admin/group-alerts/devices/${deviceId}`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await ingest(event())).statusCode).toBe(401);
    await deliverGroupAlerts(); expect(send).not.toHaveBeenCalled();
  });
});
