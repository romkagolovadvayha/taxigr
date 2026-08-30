import type { RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db, firstRow } from './db';
import {
  deleteMaxMessage,
  editMaxMessage,
  sendMaxLocation,
  sendMaxMessage,
} from './max-bot';
import {
  deleteTelegramMessage,
  editTelegramMessage,
  sendTelegramMessage,
  sendTelegramVenue,
} from './telegram-bot';
import {
  deleteVkMessage,
  editVkMessage,
  sendVkMessage,
  vkInlineKeyboard,
} from './vk-bot';

export type MessengerButton =
  | {
      type: 'callback';
      label: string;
      data: string;
      intent?: 'default' | 'positive' | 'negative';
    }
  | {
      type: 'link';
      label: string;
      url: string;
      intent?: 'default' | 'positive' | 'negative';
    };

export type MessengerLocation = {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type PersonalMessengerNotification = {
  orderId?: string;
  audience?: 'passenger' | 'driver';
  syncExistingOrderMessages?: boolean;
  icon?: string;
  title: string;
  body: string;
  details?: ReadonlyArray<readonly [label: string, value: unknown]>;
  buttons?: ReadonlyArray<ReadonlyArray<MessengerButton>>;
  locations?: ReadonlyArray<MessengerLocation>;
  action?: {
    label: string;
    url: string;
  };
};

type MessengerAccountRow = RowDataPacket & {
  id: number;
  user_id: string;
  provider: 'max' | 'telegram' | 'vk';
  external_user_id: string;
  chat_id: string;
};

type TrackedOrderMessageRow = RowDataPacket & {
  message_id: string;
};

function clean(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .trim();
  if (!text) return null;
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

export function formatPersonalMessengerNotification(
  notification: PersonalMessengerNotification,
): string {
  const lines = [
    `${notification.icon ?? '🔔'} ${notification.title}`,
    '',
    notification.body,
  ];
  for (const [label, rawValue] of notification.details ?? []) {
    const value = clean(rawValue);
    if (value) lines.push(`${label}: ${value}`);
  }
  const message = lines.join('\n');
  return message.length <= 4_000 ? message : `${message.slice(0, 3_999)}…`;
}

function notificationButtonRows(
  notification: PersonalMessengerNotification,
): ReadonlyArray<ReadonlyArray<MessengerButton>> {
  return [
    ...(notification.buttons ?? []),
    ...(notification.action
      ? [[{
          type: 'link' as const,
          label: notification.action.label,
          url: notification.action.url,
        }]]
      : []),
  ];
}

function maxMessageBody(notification: PersonalMessengerNotification): Record<string, unknown> {
  const buttonRows = notificationButtonRows(notification);
  return {
    text: formatPersonalMessengerNotification(notification),
    attachments: buttonRows.length
      ? [{
          type: 'inline_keyboard',
          payload: {
            buttons: buttonRows.map((row) => row.map((button) =>
              button.type === 'callback'
                ? {
                    type: 'callback',
                    text: button.label,
                    payload: button.data,
                    intent: button.intent ?? 'default',
                  }
                : {
                    type: 'link',
                    text: button.label,
                    url: button.url,
                  },
            )),
          },
        }]
      : [],
  };
}

function telegramMessageBody(
  notification: PersonalMessengerNotification,
): Record<string, unknown> {
  const buttonRows = notificationButtonRows(notification);
  return {
    text: formatPersonalMessengerNotification(notification),
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: buttonRows.map((row) => row.map((button) => ({
        text: button.label,
        style:
          button.intent === 'positive'
            ? 'success'
            : button.intent === 'negative'
              ? 'danger'
              : 'primary',
        ...(button.type === 'callback'
          ? { callback_data: button.data }
          : { url: button.url }),
      }))),
    },
  };
}

function vkMessageBody(notification: PersonalMessengerNotification) {
  const buttonRows = notificationButtonRows(notification);
  return {
    message: [
      formatPersonalMessengerNotification(notification),
      ...(notification.locations ?? []).map((location) =>
        `📍 ${location.title}\n${location.address}\nhttps://yandex.ru/maps/?pt=${location.longitude},${location.latitude}&z=16&l=map`,
      ),
    ].join('\n\n'),
    ...(buttonRows.length
      ? { keyboard: vkInlineKeyboard(buttonRows.map((row) => row.map((button) => ({
          type: button.type,
          label: button.label,
          data: button.type === 'callback' ? button.data : undefined,
          url: button.type === 'link' ? button.url : undefined,
          intent: button.intent,
        })))) }
      : {}),
  };
}

async function editOrderMessage(
  account: MessengerAccountRow,
  messageId: string,
  notification: PersonalMessengerNotification,
): Promise<void> {
  if (account.provider === 'max') {
    if (config.MAX_BOT_TOKEN) {
      await editMaxMessage(account.external_user_id, messageId, maxMessageBody(notification));
    }
    return;
  }
  if (account.provider === 'telegram' && config.TELEGRAM_BOT_TOKEN) {
    await editTelegramMessage(account.chat_id, messageId, telegramMessageBody(notification));
    return;
  }
  if (account.provider === 'vk' && config.VK_BOT_TOKEN) {
    await editVkMessage(account.chat_id, messageId, vkMessageBody(notification));
  }
}

async function trackOrderMessage(
  account: MessengerAccountRow,
  notification: PersonalMessengerNotification,
  messageId: string,
): Promise<void> {
  if (
    !notification.orderId ||
    !notification.audience ||
    notification.syncExistingOrderMessages === false
  ) return;
  await db.execute(
    `INSERT IGNORE INTO messenger_order_messages
      (order_id, messenger_account_id, audience, message_id)
     VALUES (?, ?, ?, ?)`,
    [notification.orderId, account.id, notification.audience, messageId],
  );
}

async function trackedOrderMessageIds(
  account: MessengerAccountRow,
  notification: PersonalMessengerNotification,
): Promise<string[]> {
  if (!notification.orderId || notification.syncExistingOrderMessages === false) return [];
  const [rows] = await db.query<TrackedOrderMessageRow[]>(
    `SELECT message_id FROM messenger_order_messages
     WHERE order_id = ? AND messenger_account_id = ?`,
    [notification.orderId, account.id],
  );
  return [...new Set(rows.map((row) => row.message_id))];
}

async function deleteOrderMessage(
  account: MessengerAccountRow,
  messageId: string,
): Promise<void> {
  if (account.provider === 'max') {
    if (config.MAX_BOT_TOKEN) {
      await deleteMaxMessage(account.external_user_id, messageId);
    }
    return;
  }
  if (account.provider === 'telegram') {
    if (config.TELEGRAM_BOT_TOKEN) {
      await deleteTelegramMessage(account.chat_id, messageId);
    }
    return;
  }
  if (config.VK_BOT_TOKEN) await deleteVkMessage(account.chat_id, messageId);
}

async function removePreviousOrderMessages(
  account: MessengerAccountRow,
  notification: PersonalMessengerNotification,
  previousMessageIds: string[],
): Promise<void> {
  if (!notification.orderId || !previousMessageIds.length) return;
  const results = await Promise.allSettled(
    previousMessageIds.map((messageId) => deleteOrderMessage(account, messageId)),
  );
  const removedMessageIds = previousMessageIds.filter(
    (_messageId, index) => results[index]?.status === 'fulfilled',
  );
  if (!removedMessageIds.length) return;
  const placeholders = removedMessageIds.map(() => '?').join(',');
  await db.execute(
    `DELETE FROM messenger_order_messages
     WHERE order_id = ? AND messenger_account_id = ?
       AND message_id IN (${placeholders})`,
    [notification.orderId, account.id, ...removedMessageIds],
  );
}

async function syncTrackedOrderMessages(
  account: MessengerAccountRow,
  notification: PersonalMessengerNotification,
  sourceMessageId?: string,
): Promise<void> {
  if (!notification.orderId) return;
  const [rows] = await db.query<TrackedOrderMessageRow[]>(
    `SELECT message_id FROM messenger_order_messages
     WHERE order_id = ? AND messenger_account_id = ?`,
    [notification.orderId, account.id],
  );
  const messageIds = [...new Set([
    ...rows.map((row) => row.message_id),
    ...(sourceMessageId ? [sourceMessageId] : []),
  ])];
  if (sourceMessageId) await trackOrderMessage(account, notification, sourceMessageId);
  for (const messageId of messageIds) {
    await editOrderMessage(account, messageId, notification).catch(() => undefined);
  }
}

async function deliver(
  account: MessengerAccountRow,
  notification: PersonalMessengerNotification,
): Promise<void> {
  const previousMessageIds = await trackedOrderMessageIds(account, notification);
  if (account.provider === 'max') {
    if (!config.MAX_BOT_TOKEN) return;
    const messageId = await sendMaxMessage(account.external_user_id, maxMessageBody(notification));
    if (messageId) {
      await trackOrderMessage(account, notification, messageId);
      await removePreviousOrderMessages(account, notification, previousMessageIds);
    }
    for (const location of notification.locations ?? []) {
      await sendMaxLocation(account.external_user_id, location);
    }
    return;
  }

  if (account.provider === 'vk') {
    if (!config.VK_BOT_TOKEN) return;
    const messageId = await sendVkMessage(account.chat_id, vkMessageBody(notification));
    if (messageId) {
      await trackOrderMessage(account, notification, messageId);
      await removePreviousOrderMessages(account, notification, previousMessageIds);
    }
    return;
  }

  if (!config.TELEGRAM_BOT_TOKEN) return;
  const messageId = await sendTelegramMessage(account.chat_id, telegramMessageBody(notification));
  if (messageId) {
    await trackOrderMessage(account, notification, messageId);
    await removePreviousOrderMessages(account, notification, previousMessageIds);
  }
  for (const location of notification.locations ?? []) {
    await sendTelegramVenue(account.chat_id, location);
  }
}

export async function notifyMessengerAccount(
  provider: 'max' | 'telegram' | 'vk',
  externalUserId: string,
  notification: PersonalMessengerNotification,
): Promise<void> {
  const account = await firstRow<MessengerAccountRow>(
    `SELECT id, user_id, provider, external_user_id, chat_id
     FROM user_messenger_accounts
     WHERE provider = ? AND external_user_id = ?
       AND active = TRUE AND bot_contact_available = TRUE
     LIMIT 1`,
    [provider, externalUserId],
  );
  if (account) await deliver(account, notification);
}

export async function refreshMessengerAccountOrderMessages(
  provider: 'max' | 'telegram' | 'vk',
  externalUserId: string,
  notification: PersonalMessengerNotification,
  sourceMessageId?: string,
): Promise<void> {
  const account = await firstRow<MessengerAccountRow>(
    `SELECT id, user_id, provider, external_user_id, chat_id
     FROM user_messenger_accounts
     WHERE provider = ? AND external_user_id = ?
       AND active = TRUE AND bot_contact_available = TRUE
     LIMIT 1`,
    [provider, externalUserId],
  );
  if (account) {
    await syncTrackedOrderMessages(account, notification, sourceMessageId);
  }
}

export async function closeUnassignedDriverOrderOffers(
  orderId: string,
  assignedDriverUserId = '',
  reason: 'accepted' | 'expired' = 'accepted',
): Promise<void> {
  const [rows] = await db.query<(MessengerAccountRow & TrackedOrderMessageRow)[]>(
    `SELECT uma.id, uma.user_id, uma.provider, uma.external_user_id, uma.chat_id,
       mom.message_id
     FROM messenger_order_messages mom
     JOIN user_messenger_accounts uma ON uma.id = mom.messenger_account_id
     WHERE mom.order_id = ? AND mom.audience = 'driver'
       AND uma.user_id <> ? AND uma.active = TRUE AND uma.bot_contact_available = TRUE`,
    [orderId, assignedDriverUserId],
  );
  const notification: PersonalMessengerNotification = {
    orderId,
    audience: 'driver',
    icon: '🚕',
    title: reason === 'expired' ? 'Поиск по заказу завершён' : 'Заказ уже принят',
    body: reason === 'expired'
      ? 'Пассажир больше не ожидает водителя по этому заказу.'
      : 'Этот заказ принял другой водитель.',
    buttons: [[{
      type: 'link',
      label: '🚕 К доступным заказам',
      url: appUrl('/driver'),
    }]],
  };
  for (const row of rows) {
    await editOrderMessage(row, row.message_id, notification).catch(() => undefined);
  }
}

export async function notifyUsersInMessengers(
  userIds: string[],
  notification: PersonalMessengerNotification,
): Promise<void> {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return;
  const placeholders = uniqueUserIds.map(() => '?').join(',');
  const [accounts] = await db.query<MessengerAccountRow[]>(
    `SELECT id, user_id, provider, external_user_id, chat_id
     FROM user_messenger_accounts
     WHERE user_id IN (${placeholders})
       AND active = TRUE AND bot_contact_available = TRUE
       AND notifications_enabled = TRUE`,
    uniqueUserIds,
  );
  if (!accounts.length) return;

  const results = await Promise.allSettled(
    accounts.map((account) => deliver(account, notification)),
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length) {
    throw new AggregateError(
      failures,
      `Failed to deliver ${failures.length} of ${accounts.length} messenger notifications`,
    );
  }
}

export async function notifyOnlineDriversInMessengers(
  notification: PersonalMessengerNotification,
): Promise<void> {
  const [rows] = await db.query<(RowDataPacket & { user_id: string })[]>(
    "SELECT user_id FROM drivers WHERE status = 'online'",
  );
  await notifyUsersInMessengers(rows.map((row) => row.user_id), notification);
}

export async function notifyDriversInMessengers(
  driverIds: string[],
  notification: PersonalMessengerNotification,
): Promise<void> {
  const uniqueDriverIds = [...new Set(driverIds)];
  if (!uniqueDriverIds.length) return;
  const placeholders = uniqueDriverIds.map(() => '?').join(',');
  const [rows] = await db.query<(RowDataPacket & { user_id: string })[]>(
    `SELECT user_id FROM drivers WHERE id IN (${placeholders})`,
    uniqueDriverIds,
  );
  await notifyUsersInMessengers(rows.map((row) => row.user_id), notification);
}

export function appUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.PUBLIC_URL.replace(/\/$/u, '')}${normalizedPath}`;
}
