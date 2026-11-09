import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import type { RideOrder, Address } from '../src/domain/models';
import { isFreshMaxTaxiRequest } from '../src/domain/group-alerts';
import { explicitBotAddress, splitBotRoute } from '../src/domain/free-text-address';
import { advanceMaxGroupBooking, maxGroupDriverMessage, maxGroupOrderKey, type GroupBookingDraft } from './max-group-booking-flow';
import { botPickupTiming, resolveBotAddressOptions, unresolvedBotAddress } from './bot-address';
import { interpretBotAddress } from './bot-address-ai';
import { readBookingSettings } from './booking-settings';
import { config } from './config';
import { firstRow, db, withTransaction } from './db';
import { deviceFor, groupEventSchema, parseGroups } from './group-alerts';
import { hasCurrentInitialConsents } from './legal';
import { orderSelect, presentOrder, type OrderRow } from './presenters';
import { driverPricedBotQuote, sha256, signOrderQuote, signSession, verifyOrderQuote } from './security';

const maxId = z.string().regex(/^[1-9]\d{0,19}$/u);
const eventKey = z.string().regex(/^[a-f0-9]{64}$/u);
const actionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('start'), accountId: maxId, event: groupEventSchema }),
  z.strictObject({ action: z.literal('message'), accountId: maxId, senderId: maxId, eventId: eventKey, text: z.string().trim().min(1).max(2000), sentAt: z.number().int() }),
  z.strictObject({ action: z.literal('poll'), accountId: maxId }),
  z.strictObject({ action: z.literal('ack'), accountId: maxId, senderId: maxId, orderId: z.uuid(), driverId: z.uuid() }),
]);
type SessionRow = RowDataPacket & { id: string; sender_id: string; draft_json: GroupBookingDraft | string; expires_at: Date };
const json = (value: SessionRow['draft_json']): GroupBookingDraft => typeof value === 'string' ? JSON.parse(value) : value;
function freshDraft(text = ''): GroupBookingDraft {
  const intent = text.replace(/^кто\s+таксует[?!.,\s]+/iu, '').trim();
  const routeText = botPickupTiming(intent) ? '' : intent;
  const pair = splitBotRoute(routeText);
  const part = pair ? null : explicitBotAddress(routeText);
  const raw = pair?.every(value => value.length >= 2 && value.length <= 255)
    ? { pickup: pair[0], destination: pair[1] }
    : part ? { [part.field]: part.text } : {};
  return { id: randomUUID(), stage: raw.pickup && !raw.destination ? 'destination' : 'pickup', raw };
}
const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
const unpricedRouteCodes = ['ROUTE_UNAVAILABLE', 'ROUTE_NOT_FOUND', 'ADDRESS_COORDINATES_REQUIRED', 'INVALID_ADDRESS'];
const phoneLink = () => config.MAX_BOT_USERNAME
  ? `Подтвердите номер и примите условия в MAX: https://max.ru/${config.MAX_BOT_USERNAME}. Затем напишите «готово».`
  : 'Подтвердите номер и примите условия в «Такси Грахово» в MAX. Затем напишите «готово».';

export async function pruneMaxGroupBookingData() {
  await db.execute('DELETE FROM max_group_booking_sessions WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)');
}

export function registerMaxGroupBooking(app: FastifyInstance, prices: {
  estimate: (pickup: Address, destination: Address) => Promise<number>;
}) {
  async function passenger(senderId: string) {
    return firstRow<RowDataPacket & { id: string }>(
      `SELECT u.id FROM user_messenger_accounts a JOIN users u ON u.id = a.user_id
       JOIN user_roles r ON r.user_id = u.id AND r.role = 'passenger'
       WHERE a.provider = 'max' AND a.external_user_id = ? AND a.active = TRUE
         AND u.phone IS NOT NULL AND u.phone_verified_at IS NOT NULL
         AND u.deleted_at IS NULL AND u.blocked_at IS NULL LIMIT 1`, [senderId],
    );
  }
  async function call<T>(passengerId: string, path: string, payload: Record<string, unknown>) {
    const key = sha256(passengerId).slice(0, 24).match(/.{4}/gu)!.join(':');
    const result = await app.inject({
      method: 'POST', url: path, remoteAddress: `fd00:1:${key}`, payload,
      headers: { authorization: `Bearer ${await signSession({ id: passengerId, roles: ['passenger'] })}` },
    });
    const body = result.json<{ data?: T; error?: { code?: string; message?: string } }>();
    if (result.statusCode >= 400 || body.data === undefined) {
      throw Object.assign(new Error(body.error?.message ?? 'Ошибка сервиса'), { code: body.error?.code, statusCode: result.statusCode });
    }
    return body.data;
  }
  async function order(draft: GroupBookingDraft) {
    if (!draft.orderId || !draft.passengerId) return null;
    return firstRow<OrderRow>(`${orderSelect} WHERE o.id = ? AND o.passenger_id = ? AND o.idempotency_key = ?`,
      [draft.orderId, draft.passengerId, maxGroupOrderKey + draft.id]);
  }
  const saveClosed = (row: SessionRow, draft: GroupBookingDraft) => db.execute(
    `UPDATE max_group_booking_sessions SET draft_json = ?, expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)
     WHERE id = ? AND JSON_UNQUOTE(JSON_EXTRACT(draft_json, '$.id')) = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(draft_json, '$.stage')) = 'waiting'`,
    [JSON.stringify({ id: draft.id, stage: 'closed', raw: {} }), row.id, draft.id],
  );
  app.post('/v1/group-alerts/max-booking', { config: { rateLimit: { max: 45, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!config.MAX_GROUP_BOOKING_DEVICE_ID || !config.MAX_GROUP_BOOKING_ACCOUNT_ID) throw fail(404, 'Личные ответы MAX выключены');
    const device = await deviceFor(request);
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) throw fail(400, 'Некорректное сообщение MAX');
    const input = parsed.data;
    const accountId = config.MAX_GROUP_BOOKING_ACCOUNT_ID;
    if (device.id !== config.MAX_GROUP_BOOKING_DEVICE_ID || input.accountId !== accountId) throw fail(403, 'Для этого аккаунта личные ответы выключены');
    const scope = [device.id, accountId];
    if (input.action === 'poll') {
      const [sessions] = await db.query<SessionRow[]>(`SELECT * FROM max_group_booking_sessions
        WHERE device_id = ? AND account_id = ? AND expires_at > UTC_TIMESTAMP(3) ORDER BY expires_at DESC LIMIT 100`, scope);
      const watch: string[] = [];
      const messages: { senderId: string; orderId: string; driverId: string; key: string; text: string }[] = [];
      let waiting = false;
      for (const row of sessions) {
        const draft = json(row.draft_json);
        if (draft.stage === 'closed') continue;
        if (draft.stage !== 'waiting') { watch.push(row.sender_id); continue; }
        const ride = await order(draft);
        if (!ride || ride.status === 'cancelled' || ride.status === 'completed') {
          await saveClosed(row, draft);
          continue;
        }
        watch.push(row.sender_id);
        waiting = true;
        if (!ride.driver_id || ride.driver_id === draft.notifiedDriverId || !['accepted', 'driver_arriving', 'driver_waiting'].includes(ride.status)) continue;
        if ((await passenger(row.sender_id))?.id !== ride.passenger_id) {
          await saveClosed(row, draft);
          continue;
        }
        const locationFresh = ride.driver_location_at != null && Date.now() - new Date(ride.driver_location_at).getTime() < 120_000;
        const text = maxGroupDriverMessage(presentOrder(ride), ride.active_driver_id === ride.driver_id, locationFresh);
        if (text) messages.push({ senderId: row.sender_id, orderId: ride.id, driverId: ride.driver_id, key: `driver:${ride.id}:${ride.driver_id}`, text });
      }
      return { data: { watch, waiting, messages } };
    }
    if (input.action === 'ack') {
      const row = await firstRow<SessionRow>('SELECT * FROM max_group_booking_sessions WHERE device_id = ? AND account_id = ? AND sender_id = ?',
        [...scope, input.senderId]);
      if (row) {
        const draft = json(row.draft_json);
        if (draft.stage === 'waiting' && draft.orderId === input.orderId && (await order(draft))?.driver_id === input.driverId) {
          await db.execute(`UPDATE max_group_booking_sessions SET draft_json = JSON_SET(draft_json, '$.notifiedDriverId', ?)
            WHERE id = ? AND JSON_UNQUOTE(JSON_EXTRACT(draft_json, '$.id')) = ?
              AND JSON_UNQUOTE(JSON_EXTRACT(draft_json, '$.stage')) = 'waiting'`, [input.driverId, row.id, draft.id]);
        }
      }
      return { data: {} };
    }

    const start = input.action === 'start';
    const senderId = start ? input.event.senderId : input.senderId;
    const key = start ? input.event.eventId : input.eventId;
    const time = start ? input.event.sentAt : input.sentAt;
    if (!senderId || senderId === accountId || time > Date.now() + 30_000 || time < Date.now() - 180_000) return { data: {} };
    if (start) {
      const event = input.event;
      if (event.provider !== 'max' || !parseGroups(device.groups_json).some(group => group.provider === 'max' && group.id && group.id === event.groupId) ||
          !isFreshMaxTaxiRequest(event.text, time) || !(await readBookingSettings()).enabled) return { data: {} };
    }
    const result = await withTransaction(async connection => {
      if (start) {
        await connection.execute(`INSERT INTO max_group_booking_sessions (id, device_id, account_id, sender_id, draft_json, expires_at)
          VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id = id`,
        [randomUUID(), ...scope, senderId, JSON.stringify(freshDraft())]);
      }
      const [rows] = await connection.query<SessionRow[]>(`SELECT * FROM max_group_booking_sessions
        WHERE device_id = ? AND account_id = ? AND sender_id = ? FOR UPDATE`, [...scope, senderId]);
      const row = rows[0];
      if (!row) return {};
      const existing = json(row.draft_json);
      const expired = new Date(row.expires_at).getTime() <= Date.now();
      const [receipts] = await connection.query<(RowDataPacket & { reply_text: string | null })[]>(
        'SELECT reply_text FROM max_group_booking_receipts WHERE session_id = ? AND event_key = ?', [row.id, key]);
      if (receipts[0]) return expired ? {} : { text: receipts[0].reply_text, watch: existing.stage !== 'closed', waiting: existing.stage === 'waiting' };
      if (start ? !expired : expired || existing.stage === 'closed') return {};
      const draft = start ? freshDraft(input.event.text) : existing;
      const text = start
        ? 'Здравствуйте, таксую'
        : await advanceMaxGroupBooking(draft, input.text, {
          resolve: async (raw, field) => {
            const result = await resolveBotAddressOptions(raw, field === 'pickup');
            if (result.address || result.candidates.length || /^(?:где[- ]то там|тут|здесь|сюда|туда|рядом|домой|к нам|ко мне|там же)[.!?]*$/iu.test(raw)) return result;
            return { address: unresolvedBotAddress(raw), candidates: [] };
          },
          interpretRoute: interpretBotAddress, pickupTiming: botPickupTiming, verificationText: phoneLink(),
          quote: async (pickup, destination) => {
            const user = await passenger(senderId);
            const verified = user && await hasCurrentInitialConsents(connection, user.id) ? user : null;
            if (![pickup, destination].some(address => address.id.startsWith('manual:'))) {
              try {
                if (!verified) return { estimateMinor: await prices.estimate(pickup, destination) };
                const data = await call<{ quoteToken: string }>(verified.id, '/v1/quotes', { pickup, destination });
                const claims = await verifyOrderQuote(data.quoteToken, verified.id);
                return { passengerId: verified.id, quote: { pickup: claims.pickup, destination: claims.destination, priceMinor: claims.prices.economy,
                  token: await signOrderQuote({ ...claims, maxGroupBooking: true }) } };
              } catch (error) {
                if (!unpricedRouteCodes.includes(String((error as { code?: string }).code))) throw error;
              }
            }
            if (!verified) return { estimateMinor: null };
            const token = await signOrderQuote({ ...driverPricedBotQuote(verified.id, pickup, destination), maxGroupBooking: true });
            return { passengerId: verified.id, quote: { pickup, destination, priceMinor: null, token } };
          },
          submit: async current => {
            const user = await passenger(senderId);
            if (!user || user.id !== current.passengerId) throw Object.assign(new Error('Подтвердите номер'), { code: 'PHONE_VERIFICATION_REQUIRED' });
            const quoted = current.quote!;
            const ride = await call<RideOrder>(user.id, '/v1/orders', {
              pickup: quoted.pickup, destination: quoted.destination, quoteToken: quoted.token, tariff: 'economy', paymentMethod: 'cash',
              idempotencyKey: maxGroupOrderKey + current.id, deviceId: `messenger:max:${senderId}`,
              comment: `Из MAX. Со слов пассажира: ${current.raw.pickup} → ${current.raw.destination}`.slice(0, 500),
            });
            return ride.id;
          },
          cancel: async current => {
            if (!current.passengerId || (await passenger(senderId))?.id !== current.passengerId) throw fail(403, 'Нет доступа к поездке');
            await call(current.passengerId, `/v1/orders/${current.orderId}/cancel`, {});
          },
        }, time).catch(error => {
          if (error?.statusCode === 409 || error?.statusCode === 403) return 'Сейчас поездку оформить не получилось.';
          throw error;
        });
      const stored = draft.stage === 'closed' ? { id: draft.id, stage: draft.stage, optOut: draft.optOut, raw: {} } : draft;
      await connection.execute(`UPDATE max_group_booking_sessions SET draft_json = ?,
        expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE) WHERE id = ?`,
      [JSON.stringify(stored), draft.optOut ? 90 * 24 * 60 : draft.stage === 'waiting' ? config.ORDER_SEARCH_TTL_MINUTES + 30 : 15, row.id]);
      await connection.execute('INSERT INTO max_group_booking_receipts (session_id, event_key, reply_text) VALUES (?, ?, ?)', [row.id, key, text]);
      return { text, watch: draft.stage !== 'closed', waiting: draft.stage === 'waiting' };
    }, { isolationLevel: 'READ COMMITTED' });
    return { data: result };
  });
}
