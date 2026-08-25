import type { RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db, firstRow } from './db';
import { sendMaxLocation, sendMaxMessage } from './max-bot';
import { sendTelegramMessage, sendTelegramVenue } from './telegram-bot';

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
  provider: 'max' | 'telegram';
  external_user_id: string;
  chat_id: string;
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

async function deliver(
  account: MessengerAccountRow,
  notification: PersonalMessengerNotification,
): Promise<void> {
  const text = formatPersonalMessengerNotification(notification);
  const buttonRows: ReadonlyArray<ReadonlyArray<MessengerButton>> = [
    ...(notification.buttons ?? []),
    ...(notification.action
      ? [[{
          type: 'link' as const,
          label: notification.action.label,
          url: notification.action.url,
        }]]
      : []),
  ];
  if (account.provider === 'max') {
    if (!config.MAX_BOT_TOKEN) return;
    await sendMaxMessage(account.external_user_id, {
      text,
      ...(buttonRows.length
        ? {
            attachments: [{
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
            }],
          }
        : {}),
    });
    for (const location of notification.locations ?? []) {
      await sendMaxLocation(account.external_user_id, location);
    }
    return;
  }

  if (!config.TELEGRAM_BOT_TOKEN) return;
  await sendTelegramMessage(account.chat_id, {
    text,
    disable_web_page_preview: true,
    ...(buttonRows.length
      ? {
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
        }
      : {}),
  });
  for (const location of notification.locations ?? []) {
    await sendTelegramVenue(account.chat_id, location);
  }
}

export async function notifyMessengerAccount(
  provider: 'max' | 'telegram',
  externalUserId: string,
  notification: PersonalMessengerNotification,
): Promise<void> {
  const account = await firstRow<MessengerAccountRow>(
    `SELECT provider, external_user_id, chat_id
     FROM user_messenger_accounts
     WHERE provider = ? AND external_user_id = ?
       AND active = TRUE AND bot_contact_available = TRUE
     LIMIT 1`,
    [provider, externalUserId],
  );
  if (account) await deliver(account, notification);
}

export async function notifyUsersInMessengers(
  userIds: string[],
  notification: PersonalMessengerNotification,
): Promise<void> {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return;
  const placeholders = uniqueUserIds.map(() => '?').join(',');
  const [accounts] = await db.query<MessengerAccountRow[]>(
    `SELECT provider, external_user_id, chat_id
     FROM user_messenger_accounts
     WHERE user_id IN (${placeholders})
       AND active = TRUE AND bot_contact_available = TRUE`,
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
