import type { RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db } from './db';
import { sendMaxMessage } from './max-bot';
import { sendTelegramMessage } from './telegram-bot';

export type PersonalMessengerNotification = {
  icon?: string;
  title: string;
  body: string;
  details?: ReadonlyArray<readonly [label: string, value: unknown]>;
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
  if (account.provider === 'max') {
    if (!config.MAX_BOT_TOKEN) return;
    await sendMaxMessage(account.external_user_id, {
      text,
      ...(notification.action
        ? {
            attachments: [{
              type: 'inline_keyboard',
              payload: {
                buttons: [[{
                  type: 'link',
                  text: notification.action.label,
                  url: notification.action.url,
                }]],
              },
            }],
          }
        : {}),
    });
    return;
  }

  if (!config.TELEGRAM_BOT_TOKEN) return;
  await sendTelegramMessage(account.chat_id, {
    text,
    disable_web_page_preview: true,
    ...(notification.action
      ? {
          reply_markup: {
            inline_keyboard: [[{
              text: notification.action.label,
              url: notification.action.url,
            }]],
          },
        }
      : {}),
  });
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
