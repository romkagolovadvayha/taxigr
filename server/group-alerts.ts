import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import { groupAllowed, isTaxiRequest, senderPhone, type WatchedGroup } from '../src/domain/group-alerts';
import { db, firstRow, withTransaction } from './db';
import { config } from './config';
import { appUrl, notifyMessengerAccount } from './messenger-notifications';
import { authenticate, randomToken, sha256 } from './security';

const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw fail(400, 'Проверьте заполненные данные');
  return result.data;
}
const groupsSchema = z.array(z.object({ provider: z.enum(['max', 'whatsapp']), title: z.string().trim().min(1).max(200) })).min(1).max(30);
export const groupEventSchema = z.object({
  eventId: z.string().regex(/^[a-f0-9]{64}$/u), provider: z.enum(['max', 'whatsapp']),
  groupTitle: z.string().trim().min(1).max(200), senderName: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000), sentAt: z.number().int().positive(),
  // NotificationListener provides Person.uri. Display name and text are never identities.
  senderUri: z.string().max(200).optional(),
}).strict();
type Device = RowDataPacket & { id: string; owner_id: string; groups_json: WatchedGroup[] | string };
const parseGroups = (value: Device['groups_json']): WatchedGroup[] => groupsSchema.parse(typeof value === 'string' ? JSON.parse(value) : value);

async function adminId(request: FastifyRequest): Promise<string> {
  const session = await authenticate(request);
  const row = await firstRow<RowDataPacket>(`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = ? AND r.role = 'admin' AND u.deleted_at IS NULL AND u.blocked_at IS NULL`, [session.id]);
  if (!row) throw fail(403, 'Требуются права администратора');
  return session.id;
}

async function deviceFor(request: FastifyRequest): Promise<Device> {
  const token = request.headers.authorization?.replace(/^Bearer /u, '');
  if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw fail(401, 'Подключите устройство заново');
  const device = await firstRow<Device>(`SELECT d.id, d.owner_id, d.groups_json FROM group_alert_devices d
    JOIN users u ON u.id = d.owner_id JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
    WHERE d.token_hash = ? AND d.revoked_at IS NULL AND u.deleted_at IS NULL AND u.blocked_at IS NULL`, [sha256(token)]);
  if (!device) throw fail(401, 'Устройство отключено');
  return device;
}

export async function matchGroupAuthor(connection: PoolConnection, uri?: string): Promise<string | null> {
  const phone = senderPhone(uri);
  // Notification keys are opaque. MAX account IDs must not be guessed from them.
  if (!phone) return null;
  const [rows] = await connection.query<(RowDataPacket & { id: string })[]>(
    'SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND deleted_at IS NULL LIMIT 2', [phone]);
  return rows.length === 1 ? rows[0]!.id : null;
}

export function registerGroupAlertRoutes(app: FastifyInstance): void {
  app.get('/v1/admin/group-alerts/devices', async request => {
    const owner = await adminId(request);
    const [devices] = await db.query<RowDataPacket[]>(`SELECT id, name, groups_json AS watchedGroups,
      created_at AS createdAt, last_seen_at AS lastSeenAt, revoked_at AS revokedAt,
      token_hash IS NOT NULL AS paired FROM group_alert_devices WHERE owner_id = ? ORDER BY created_at DESC LIMIT 30`, [owner]);
    const [channels] = await db.query<RowDataPacket[]>(`SELECT provider FROM user_messenger_accounts
      WHERE user_id = ? AND active = TRUE AND bot_contact_available = TRUE AND notifications_enabled = TRUE`, [owner]);
    return { data: { devices, channels: channels.map(row => row.provider) } };
  });
  app.post('/v1/admin/group-alerts/devices', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async request => {
    const owner = await adminId(request);
    const input = parse(z.object({ name: z.string().trim().min(1).max(100), groups: groupsSchema }), request.body);
    const [channels] = await db.query<RowDataPacket[]>(`SELECT id FROM user_messenger_accounts WHERE user_id = ?
      AND active = TRUE AND bot_contact_available = TRUE AND notifications_enabled = TRUE`, [owner]);
    if (!channels.length) throw fail(409, 'Сначала включите уведомления хотя бы в одном боте в своём профиле');
    const code = randomBytes(6).toString('hex').toUpperCase();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 600_000);
    await db.execute(`INSERT INTO group_alert_devices (id, owner_id, name, groups_json, pairing_hash, pairing_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [id, owner, input.name, JSON.stringify(input.groups), sha256(code), expiresAt]);
    return { data: { id, code, expiresAt: expiresAt.toISOString() } };
  });
  app.delete('/v1/admin/group-alerts/devices/:id', async request => {
    const owner = await adminId(request);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    await db.execute(`UPDATE group_alert_devices SET revoked_at = UTC_TIMESTAMP(3), token_hash = NULL,
      pairing_hash = NULL WHERE id = ? AND owner_id = ?`, [id, owner]);
    return { data: { revoked: true } };
  });
  app.post('/v1/group-alerts/pair', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { code } = parse(z.object({ code: z.string().trim().regex(/^[a-fA-F0-9]{12}$/u) }), request.body);
    return withTransaction(async connection => {
      const [rows] = await connection.query<Device[]>(`SELECT d.id, d.owner_id, d.groups_json FROM group_alert_devices d
        JOIN users u ON u.id = d.owner_id JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
        WHERE pairing_hash = ? AND pairing_expires_at > UTC_TIMESTAMP(3) AND revoked_at IS NULL
          AND u.deleted_at IS NULL AND u.blocked_at IS NULL FOR UPDATE`, [sha256(code.toUpperCase())]);
      if (!rows[0]) throw fail(401, 'Код неверен или истёк');
      const token = randomToken();
      await connection.execute('UPDATE group_alert_devices SET token_hash = ?, pairing_hash = NULL WHERE id = ?', [sha256(token), rows[0].id]);
      return { data: { token, groups: parseGroups(rows[0].groups_json) } };
    });
  });
  app.get('/v1/group-alerts/device', async request => {
    const device = await deviceFor(request);
    return { data: { groups: parseGroups(device.groups_json) } };
  });
  app.post('/v1/group-alerts/events', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async request => {
    const device = await deviceFor(request);
    const input = parse(groupEventSchema, request.body);
    if (!groupAllowed(parseGroups(device.groups_json), input.provider, input.groupTitle)) throw fail(403, 'Группа не подключена');
    const age = Date.now() - input.sentAt;
    if (age < -60_000 || age > 3_600_000 || !isTaxiRequest(input.text)) return { data: { accepted: false } };
    await withTransaction(async connection => {
      // Device lock serializes retries before the event and its delivery outbox are committed.
      const [locked] = await connection.query<RowDataPacket[]>('SELECT id FROM group_alert_devices WHERE id = ? AND revoked_at IS NULL FOR UPDATE', [device.id]);
      if (!locked.length) throw fail(401, 'Устройство отключено');
      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM group_alert_events WHERE device_id = ? AND event_key = ?', [device.id, input.eventId]);
      if (existing.length) return;
      const matched = await matchGroupAuthor(connection, input.senderUri);
      const id = randomUUID();
      await connection.execute(`INSERT INTO group_alert_events
        (id, device_id, event_key, provider, group_title, sender_name, message_text, message_at, matched_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, device.id, input.eventId, input.provider,
        input.groupTitle, input.senderName ?? null, input.text, new Date(input.sentAt), matched]);
      await connection.execute(`INSERT INTO group_alert_deliveries (event_id, account_id)
        SELECT ?, a.id FROM user_messenger_accounts a JOIN user_roles r ON r.user_id = a.user_id AND r.role = 'admin'
        WHERE a.user_id = ? AND a.active = TRUE AND a.bot_contact_available = TRUE AND a.notifications_enabled = TRUE`, [id, device.owner_id]);
      await connection.execute('UPDATE group_alert_devices SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = ?', [device.id]);
    });
    // The collector never receives database identities or telephone numbers.
    return { data: { accepted: true } };
  });
}

type Delivery = RowDataPacket & {
  event_id: string; account_id: number; provider: 'max' | 'telegram' | 'vk'; external_user_id: string;
  group_title: string; source_provider: string; sender_name: string | null; message_text: string;
  message_at: Date; matched_user_id: string | null; name: string | null; phone: string | null;
};

export async function deliverGroupAlerts(): Promise<void> {
  await db.execute('DELETE FROM group_alert_events WHERE created_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)');
  const [candidates] = await db.query<Delivery[]>(`SELECT q.event_id, q.account_id, a.provider, a.external_user_id,
    e.group_title, e.provider AS source_provider, e.sender_name, e.message_text, e.message_at,
    e.matched_user_id, matched.name, matched.phone FROM group_alert_deliveries q
    JOIN group_alert_events e ON e.id = q.event_id JOIN group_alert_devices d ON d.id = e.device_id
    JOIN user_messenger_accounts a ON a.id = q.account_id AND a.user_id = d.owner_id
    JOIN users owner ON owner.id = d.owner_id JOIN user_roles r ON r.user_id = owner.id AND r.role = 'admin'
    LEFT JOIN users matched ON matched.id = e.matched_user_id AND matched.deleted_at IS NULL
    WHERE q.delivered_at IS NULL AND q.next_attempt_at <= UTC_TIMESTAMP(3) AND q.attempts < 12
      AND e.created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY) AND d.revoked_at IS NULL
      AND owner.deleted_at IS NULL AND owner.blocked_at IS NULL
      AND a.active = TRUE AND a.bot_contact_available = TRUE AND a.notifications_enabled = TRUE LIMIT 30`);
  for (const row of candidates) {
    const configured = row.provider === 'max' ? config.MAX_BOT_TOKEN : row.provider === 'telegram' ? config.TELEGRAM_BOT_TOKEN : config.VK_BOT_TOKEN;
    if (!configured) continue;
    const [claim] = await db.execute<import('mysql2/promise').ResultSetHeader>(`UPDATE group_alert_deliveries
      SET attempts = attempts + 1, next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)
      WHERE event_id = ? AND account_id = ? AND delivered_at IS NULL AND next_attempt_at <= UTC_TIMESTAMP(3)`, [row.event_id, row.account_id]);
    if (!claim.affectedRows) continue;
    try {
      await notifyMessengerAccount(row.provider, row.external_user_id, {
        icon: '🚕', title: 'В группе ищут такси', body: row.message_text,
        details: [['Источник', `${row.source_provider === 'max' ? 'MAX' : 'WhatsApp'} · ${row.group_title}`],
          ['Автор в группе', row.sender_name],
          ['Время', new Date(row.message_at).toLocaleString('ru-RU', { timeZone: 'Europe/Samara' })],
          ['Имя в базе', row.name], ['Телефон', row.name ? row.phone : null],
          ['Совпадение', row.name ? 'Найден по идентификатору отправителя' : 'Автор не определён надёжно']],
        ...(row.name && row.matched_user_id ? { action: { label: 'Карточка пользователя', url: appUrl(`/admin/passengers/${row.matched_user_id}`) } } : {}),
      });
      await db.execute('UPDATE group_alert_deliveries SET delivered_at = UTC_TIMESTAMP(3) WHERE event_id = ? AND account_id = ?', [row.event_id, row.account_id]);
    } catch { /* The durable outbox retries this channel without repeating successful channels. */ }
  }
}
