import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import type { Address, RideOrder, Tariff } from '../src/domain/models';
import { currentInitialLegalAcceptance, legalDocuments } from '../src/legal/documents';
import { resolveBotAddress, splitBotRoute, unresolvedBotAddress } from './bot-address';
import { db, firstRow, withTransaction } from './db';
import type { MessengerIdentityInput } from './messenger-identity';
import { findOrCreatePhoneUser, findUserWithRoles, linkMessengerIdentity } from './repositories';
import { signOrderQuote, signSession } from './security';
import { sendTelegramMessage } from './telegram-bot';
import { sendMaxMessage } from './max-bot';
import { sendVkMessage, vkInlineKeyboard } from './vk-bot';

export type BookingMessage = MessengerIdentityInput & {
  eventId: string;
  text?: string;
  /** Only contacts authenticated by the provider adapter may populate this. */
  verifiedPhone?: string | null;
};
type Reply = { text: string; buttons?: { label: string; data: string }[]; requestContact?: boolean };
export type BookingDraft = {
  id: string;
  stage: 'pickup' | 'destination' | 'confirm' | 'done';
  pickupRaw?: string;
  destinationRaw?: string;
  pickup?: Address;
  destination?: Address;
  quoteToken?: string;
  priceMinor?: number;
  quotedAt?: number;
  orderId?: string;
};
const freshDraft = (): BookingDraft => ({ id: randomUUID(), stage: 'pickup' });
const readJson = <T>(value: unknown): T => typeof value === 'string' ? JSON.parse(value) as T : value as T;

export async function pruneMessengerBookingData(): Promise<void> {
  await db.execute('DELETE FROM messenger_booking_drafts WHERE expires_at < UTC_TIMESTAMP(3)');
  await db.execute('DELETE FROM messenger_booking_events WHERE created_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)');
}

// A booking holds a draft row lock while the regular order API uses another
// connection. Keep spare connections available even during webhook bursts.
let activeBookings = 0;
const bookingWaiters: (() => void)[] = [];
async function withBookingSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeBookings >= 4) await new Promise<void>(resolve => bookingWaiters.push(resolve));
  else activeBookings++;
  try { return await work(); }
  finally {
    const next = bookingWaiters.shift();
    if (next) next(); else activeBookings--;
  }
}

export async function sendBookingReply(message: BookingMessage, reply: Reply): Promise<void> {
  const buttons = reply.buttons ?? [];
  if (message.provider === 'telegram') {
    await sendTelegramMessage(message.chatId, {
      text: reply.text,
      reply_markup: reply.requestContact ? {
        keyboard: [[{ text: 'Поделиться номером для заказа', request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true,
      } : buttons.length ? {
        inline_keyboard: buttons.map(button => [{ text: button.label, callback_data: button.data }]),
      } : { remove_keyboard: true },
    });
  } else if (message.provider === 'max') {
    await sendMaxMessage(message.externalUserId, {
      text: reply.text,
      attachments: reply.requestContact || buttons.length ? [{ type: 'inline_keyboard', payload: { buttons: reply.requestContact ?
        [[{ type: 'request_contact', text: 'Поделиться номером для заказа' }]] :
        buttons.map(button => [{ type: 'callback', text: button.label, payload: button.data }]) } }] : undefined,
    });
  } else {
    await sendVkMessage(message.chatId, {
      message: reply.text,
      keyboard: buttons.length ? vkInlineKeyboard(buttons.map(button => [{ type: 'callback', ...button }])) : undefined,
    });
  }
}

function review(draft: BookingDraft): Reply {
  return {
    text: `Проверьте заказ:\nОткуда: ${draft.pickup?.label}\nКуда: ${draft.destination?.label}\n` +
      (draft.priceMinor == null ? 'Адрес не удалось определить точно. Стоимость определит водитель и согласует с вами. Ему передадим ваши адреса как написаны.' :
        `Стоимость: ${draft.priceMinor / 100} ₽.`) +
      '\nТариф: Эконом. Оплата наличными водителю.\n\n' +
      'Нажимая «Вызвать такси», вы принимаете условия и даёте согласие на обработку данных:\n' +
      [legalDocuments.terms, legalDocuments.passengerRules, legalDocuments.privacy, legalDocuments.personalDataConsent]
        .map(document => `https://taxigr.ru${document.path}`).join('\n'),
    buttons: [
      { label: draft.priceMinor == null ? 'Вызвать без цены' : `Вызвать за ${draft.priceMinor / 100} ₽`, data: `b:confirm:${draft.id}` },
      { label: 'Изменить адреса', data: `b:restart:${draft.id}` },
      { label: 'Отменить', data: `b:cancel:${draft.id}` },
    ],
  };
}

export function createMessengerBookingHandler(app: FastifyInstance) {
  const processMessage = async (message: BookingMessage): Promise<void> => {
    if (!message.eventId || message.eventId.length > 128) return;
    let account = await firstRow<RowDataPacket & { user_id: string; chat_id: string }>(
      `SELECT user_id, chat_id FROM user_messenger_accounts
       WHERE provider = ? AND external_user_id = ? AND active = TRUE LIMIT 1`,
      [message.provider, message.externalUserId],
    );
    if (!account && message.verifiedPhone) {
      await withTransaction(async connection => {
        const userId = await findOrCreatePhoneUser(connection, message.verifiedPhone!);
        await linkMessengerIdentity(connection, userId, message);
      });
      account = await firstRow<RowDataPacket & { user_id: string; chat_id: string }>(
        'SELECT user_id, chat_id FROM user_messenger_accounts WHERE provider = ? AND external_user_id = ? AND active = TRUE',
        [message.provider, message.externalUserId],
      );
    }
    if (!account) {
      await sendBookingReply(message, message.provider === 'vk' ? {
        text: 'Для первого заказа подтвердите номер, войдя через VK: https://taxigr.ru/sign-in . Затем вернитесь сюда и напишите «Такси». Следующие заказы можно оформлять прямо в чате.',
      } : {
        text: 'Закажите такси прямо здесь. Сначала поделитесь своим номером кнопкой ниже — водитель сможет связаться с вами. Затем напишите адреса. Обработка данных: https://taxigr.ru/privacy',
        requestContact: true,
      });
      return;
    }
    if (account.chat_id !== message.chatId) return;
    const user = await findUserWithRoles(account.user_id);
    if (!user || user.blockedAt) {
      await sendBookingReply(message, { text: 'Заказ недоступен для этого аккаунта.' });
      return;
    }
    if (message.verifiedPhone) {
      const owner = await firstRow<RowDataPacket & { id: string }>(
        'SELECT id FROM users WHERE phone = ? AND id <> ? AND deleted_at IS NULL',
        [message.verifiedPhone, user.id],
      );
      if (owner || (user.phone && user.phone !== message.verifiedPhone)) {
        await sendBookingReply(message, { text: 'Этот номер связан с другим профилем. Войдите с ним на https://taxigr.ru/sign-in и привяжите бота в настройках, затем вернитесь сюда.' });
        return;
      }
      await db.execute('UPDATE users SET phone = ?, phone_verified_at = UTC_TIMESTAMP(3) WHERE id = ? AND (phone IS NULL OR phone = ?)',
        [message.verifiedPhone, user.id, message.verifiedPhone]);
      user.phone = message.verifiedPhone;
    }
    if (!user.phone) {
      await sendBookingReply(message, message.provider === 'vk'
        ? { text: 'Подтвердите номер в своём профиле: https://taxigr.ru/sign-in . Затем напишите здесь «Такси».' }
        : { text: 'Поделитесь своим номером кнопкой ниже, чтобы водитель мог связаться с вами.', requestContact: true });
      return;
    }
    await db.execute(`UPDATE user_messenger_accounts SET bot_contact_available = TRUE, last_seen_at = UTC_TIMESTAMP(3)
      WHERE provider = ? AND external_user_id = ? AND active = TRUE`, [message.provider, message.externalUserId]);
    const token = await signSession({ id: user.id, roles: user.roles });
    // Separate the regular API limiter for authenticated bot passengers.
    const identityHash = createHash('sha256').update(user.id).digest('hex').slice(0, 24);
    const remoteAddress = `fd00:0:${identityHash.match(/.{4}/gu)!.join(':')}`;
    const call = async <T>(url: string, payload: Record<string, unknown>): Promise<T> => {
      const response = await app.inject({ method: 'POST', url, remoteAddress, headers: { authorization: `Bearer ${token}` }, payload });
      const body = response.json<{ data?: T; error?: { message?: string; code?: string } }>();
      if (response.statusCode >= 400 || body.data === undefined) throw Object.assign(
        new Error(body.error?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.'),
        { code: body.error?.code },
      );
      return body.data;
    };
    const text = message.text?.trim() ?? '';
    if (text.length > 520) {
      await sendBookingReply(message, { text: 'Сократите сообщение: каждый адрес — до 255 символов.' });
      return;
    }
    const reply = await withTransaction(async connection => {
      await connection.execute(`INSERT INTO messenger_booking_drafts
        (provider, external_user_id, chat_id, draft_json, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE))
        ON DUPLICATE KEY UPDATE external_user_id = VALUES(external_user_id)`,
      [message.provider, message.externalUserId, message.chatId, JSON.stringify(freshDraft())]);
      const [rows] = await connection.query<(RowDataPacket & { draft_json: unknown; expires_at: Date })[]>(
        'SELECT draft_json, expires_at FROM messenger_booking_drafts WHERE provider = ? AND external_user_id = ? FOR UPDATE',
        [message.provider, message.externalUserId]);
      const [events] = await connection.query<(RowDataPacket & { response_json: unknown })[]>(
        'SELECT response_json FROM messenger_booking_events WHERE provider = ? AND external_user_id = ? AND event_id = ?',
        [message.provider, message.externalUserId, message.eventId]);
      if (events[0]) return readJson<Reply>(events[0].response_json);
      let draft = rows[0] && new Date(rows[0].expires_at).getTime() > Date.now() ? readJson<BookingDraft>(rows[0].draft_json) : freshDraft();
      const quote = async () => {
        draft.id = randomUUID();
        const [pickup, destination] = await Promise.all([
          resolveBotAddress(draft.pickupRaw!, true), resolveBotAddress(draft.destinationRaw!, false),
        ]);
        draft.pickup = pickup ?? unresolvedBotAddress(draft.pickupRaw!);
        draft.destination = destination ?? unresolvedBotAddress(draft.destinationRaw!);
        draft.priceMinor = undefined;
        if (pickup && destination) {
          try {
            const result = await call<{ quoteToken: string; tariffs: Tariff[] }>('/v1/quotes', { pickup, destination });
            const economy = result.tariffs.find(tariff => tariff.code === 'economy');
            if (economy && economy.priceMinor > 0) {
              draft.priceMinor = economy.priceMinor;
              draft.quoteToken = result.quoteToken;
            }
          } catch (error) {
            // Service restrictions/authentication must not turn into unpriced orders.
            if (!['ROUTE_UNAVAILABLE', 'ROUTE_NOT_FOUND'].includes(String((error as { code?: string }).code))) throw error;
          }
        }
        if (draft.priceMinor == null) {
          draft.quoteToken = await signOrderQuote({
            passengerId: user.id, pricingMode: 'driver', pickup: draft.pickup, destination: draft.destination,
            destinations: [draft.destination], pricingScope: 'grahovo',
            route: { distanceMeters: 0, durationSeconds: 0, source: 'estimate' },
            pricingDistanceMeters: 0, driverApproachDistanceMeters: 0,
            prices: { economy: 0, child: 0 }, pricedAt: new Date().toISOString(),
          });
        }
        draft.quotedAt = Date.now();
        draft.stage = 'confirm';
      };
      const process = async (): Promise<Reply> => {
        const action = text.match(/^b:(confirm|restart|cancel):(.+)$/u);
        if (action && action[2] !== draft.id) return { text: 'Эта кнопка устарела. Напишите «Такси», чтобы оформить новый заказ.' };
        if (/^(?:\/cancel|отменить|отмена)$/iu.test(text) || action?.[1] === 'cancel') {
          draft = freshDraft();
          return { text: 'Черновик удалён. Напишите «Такси», когда будете готовы. Уже вызванное такси отменяется кнопкой в карточке поездки.' };
        }
        // Drivers can set the negotiated amount from any of the three bots.
        const fare = text.match(/^цена\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:₽|руб(?:лей)?)?$/iu);
        if (fare && user.roles.includes('driver')) {
          const order = await firstRow<RowDataPacket & { id: string }>(`SELECT o.id FROM orders o JOIN drivers d ON d.id = o.driver_id
            WHERE d.user_id = ? AND o.active_driver_id = d.id AND o.pricing_mode = 'driver'
              AND o.status IN ('accepted','driver_arriving','driver_waiting','in_progress') LIMIT 1`, [user.id]);
          if (!order) return { text: 'У вас нет текущего заказа с ценой по договорённости.' };
          await call(`/v1/driver/orders/${order.id}/fare`, { priceMinor: Math.round(Number(fare[1]!.replace(',', '.')) * 100) });
          return { text: 'Стоимость сохранена и передана пассажиру.' };
        }
        if (draft.stage === 'done' && (action?.[1] === 'confirm' || /^(?:вызвать|да|подтверждаю)$/iu.test(text))) {
          return { text: `Заказ уже создан: https://taxigr.ru/orders/${draft.orderId}` };
        }
        if (draft.stage === 'confirm' && (action?.[1] === 'confirm' || /^(?:вызвать(?: такси)?|вызвать без цены|да|подтверждаю)$/iu.test(text))) {
          if (!draft.quotedAt || Date.now() - draft.quotedAt > 240_000) {
            await quote();
            return { ...review(draft), text: 'Расчёт обновлён. Подтвердите актуальные условия.\n\n' + review(draft).text };
          }
          const order = await call<RideOrder>('/v1/orders', {
            pickup: draft.pickup, destination: draft.destination, quoteToken: draft.quoteToken,
            tariff: 'economy', paymentMethod: 'cash', deviceId: `messenger:${message.provider}:${message.externalUserId}`,
            idempotencyKey: `bot:${draft.id}`, legalAcceptance: currentInitialLegalAcceptance(),
            comment: `Из ${message.provider}. Со слов пассажира: ${draft.pickupRaw} → ${draft.destinationRaw}`.slice(0, 500),
          });
          draft.stage = 'done'; draft.orderId = order.id;
          return { text: `Такси вызвано. Ищем водителя.\n${draft.priceMinor == null ? 'Стоимость определит водитель и согласует с вами.\n' : ''}Статус заказа: https://taxigr.ru/orders/${order.id}` };
        }
        if (/^(?:\/start(?:@[\w]+)?|\/taxi|такси|заказать|начать|изменить адреса)$/iu.test(text) || action?.[1] === 'restart' || !text) {
          draft = freshDraft();
          return { text: 'Откуда вас забрать? Напишите адрес или название места. Можно сразу маршрут: «Советская 10 → больница». Для исправления напишите «Изменить адреса».' };
        }
        if (action) return { text: 'Сначала укажите адреса поездки.' };
        const active = await firstRow<RowDataPacket & { id: string }>(`SELECT id FROM orders WHERE passenger_id = ?
          AND status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress') LIMIT 1`, [user.id]);
        if (active) return { text: `У вас уже есть активная поездка: https://taxigr.ru/orders/${active.id}` };
        const pair = splitBotRoute(text);
        if (pair?.some(part => part.length < 2 || part.length > 255) || (!pair && (text.length < 2 || text.length > 255))) {
          return { text: 'Напишите каждый адрес длиной от 2 до 255 символов.' };
        }
        if (pair) {
          draft = { ...freshDraft(), pickupRaw: pair[0], destinationRaw: pair[1] };
        } else if (draft.stage === 'pickup' || draft.stage === 'done') {
          draft = { ...freshDraft(), stage: 'destination', pickupRaw: text };
          return { text: `Место подачи: ${text}\nКуда поедем? Напишите адрес или название места.` };
        } else if (draft.stage === 'destination') {
          draft.destinationRaw = text;
        } else {
          return { ...review(draft), text: 'Для исправления нажмите «Изменить адреса».\n\n' + review(draft).text };
        }
        await quote();
        return review(draft);
      };
      const response = await process().catch(error => ({ text: error instanceof Error ? error.message : 'Не удалось оформить заказ. Попробуйте ещё раз.' }));
      await connection.execute(`UPDATE messenger_booking_drafts SET draft_json = ?, expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE)
        WHERE provider = ? AND external_user_id = ?`, [JSON.stringify(draft), message.provider, message.externalUserId]);
      await connection.execute(`INSERT INTO messenger_booking_events (provider, external_user_id, event_id, response_json) VALUES (?, ?, ?, ?)`,
        [message.provider, message.externalUserId, message.eventId, JSON.stringify(response)]);
      return response;
    });
    await sendBookingReply(message, reply);
  };
  return (message: BookingMessage) => withBookingSlot(() => processMessage(message));
}
