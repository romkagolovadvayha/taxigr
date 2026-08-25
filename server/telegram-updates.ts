import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import { db, firstRow } from './db';
import {
  answerTelegramCallback,
  extractOwnTelegramPhone,
  requestTelegramContact,
  sendTelegramConfirmation,
  telegramStartPayload,
} from './telegram-bot';
import type {
  MessengerOrderActionRequest,
  MessengerOrderActionResult,
} from './messenger-order-actions';

export type TelegramActionHandler = (
  request: MessengerOrderActionRequest,
) => Promise<MessengerOrderActionResult>;

export const telegramUpdateSchema = z.object({
  callback_query: z.object({
    id: z.string().min(1),
    data: z.string().optional(),
    from: z.object({
      id: z.union([z.string(), z.number()]),
    }).passthrough(),
    message: z.object({
      chat: z.object({
        id: z.union([z.string(), z.number()]),
        type: z.string(),
      }).passthrough(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  message: z.object({
    text: z.string().optional(),
    from: z.object({
      id: z.union([z.string(), z.number()]),
      first_name: z.string().trim().max(80).nullish(),
      last_name: z.string().trim().max(80).nullish(),
      username: z.string().trim().max(64).nullish(),
    }).passthrough().optional(),
    chat: z.object({
      id: z.union([z.string(), z.number()]),
      type: z.string(),
    }).passthrough(),
    contact: z.object({
      phone_number: z.string(),
      user_id: z.union([z.string(), z.number()]).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export async function processTelegramUpdate(
  update: TelegramUpdate,
  onAction?: TelegramActionHandler,
): Promise<void> {
  const callback = update.callback_query;
  if (callback) {
    const chat = callback.message?.chat;
    let result: MessengerOrderActionResult = {
      text: 'Действия в чате временно недоступны.',
      alert: true,
    };
    if (chat?.type === 'private' && onAction) {
      try {
        result = await onAction({
          provider: 'telegram',
          externalUserId: String(callback.from.id),
          chatId: String(chat.id),
          data: callback.data,
        });
      } catch {
        result = {
          text: 'Не удалось выполнить действие. Повторите позже.',
          alert: true,
        };
      }
    }
    await answerTelegramCallback(callback.id, result.text, result.alert);
    return;
  }

  const message = update.message;
  if (message?.chat.type !== 'private' || message.from?.id == null) return;

  const userId = String(message.from.id);
  const chatId = String(message.chat.id);
  const payload = telegramStartPayload(message.text);

  if (payload) {
    await db.execute<ResultSetHeader>(
      `UPDATE telegram_auth_challenges
       SET telegram_user_id = ?, telegram_chat_id = ?, telegram_username = ?,
         telegram_first_name = ?, telegram_last_name = ?, failure_code = NULL
       WHERE payload_token = ? AND expires_at > UTC_TIMESTAMP(3)
         AND verified_at IS NULL`,
      [
        userId,
        chatId,
        message.from.username ?? null,
        message.from.first_name ?? null,
        message.from.last_name ?? null,
        payload,
      ],
    );
    const challenge = await firstRow<RowDataPacket & { id: string }>(
      `SELECT id FROM telegram_auth_challenges
       WHERE payload_token = ? AND telegram_user_id = ?
         AND expires_at > UTC_TIMESTAMP(3) AND verified_at IS NULL
       LIMIT 1`,
      [payload, userId],
    );
    if (challenge) await requestTelegramContact(chatId);
  }

  if (!message.contact) return;
  const verifiedPhone = extractOwnTelegramPhone(message.contact, userId);
  if (!verifiedPhone) return;

  const challenge = await firstRow<
    RowDataPacket & { id: string; expected_phone: string }
  >(
    `SELECT id, expected_phone FROM telegram_auth_challenges
     WHERE telegram_user_id = ? AND expires_at > UTC_TIMESTAMP(3)
       AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (!challenge) return;

  const matches = verifiedPhone === challenge.expected_phone;
  await db.execute(
    `UPDATE telegram_auth_challenges
     SET verified_phone = ?, failure_code = ?,
       verified_at = IF(?, UTC_TIMESTAMP(3), NULL)
     WHERE id = ? AND verified_at IS NULL`,
    [verifiedPhone, matches ? null : 'PHONE_MISMATCH', matches, challenge.id],
  );
  await sendTelegramConfirmation(chatId, matches);
}
