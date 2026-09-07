import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import webpush from 'web-push';

import { config } from './config';
import { db } from './db';
import { getVapidConfig } from './vapid';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: string;
  channelId?:
    | 'ride-taxi-found-v2'
    | 'ride-driver-arrived-v2'
    | 'ride-started-v2'
    | 'driver-orders-v2'
    | 'ride-chat-v1'
    | 'ride-complete-v2'
    | 'ride-cancelled-v2';
};

type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

const expoPushBatchSize = 100;
const rustorePushBatchSize = 20;

type NativePushTokenRow = RowDataPacket & {
  token: string;
  provider: 'expo' | 'rustore';
};

function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

function pushDeepLink(data?: Record<string, string>): string {
  const orderId = data?.orderId ? encodeURIComponent(data.orderId) : null;
  if (!orderId) return 'taxigrahovo:///';
  if (data?.chat === 'true') return `taxigrahovo:///chat/${orderId}`;
  return data?.role === 'driver'
    ? `taxigrahovo:///driver/trips/${orderId}`
    : `taxigrahovo:///orders/${orderId}`;
}

async function sendRuStorePush(token: string, message: PushMessage): Promise<'sent' | 'removed'> {
  const response = await fetch(
    `https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(config.RUSTORE_PUSH_PROJECT_ID)}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.RUSTORE_PUSH_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        message: {
          token,
          data: message.data,
          notification: {
            title: message.title,
            body: message.body,
          },
          android: {
            ttl: '86400s',
            notification: {
              title: message.title,
              body: message.body,
              icon: 'notification_icon',
              color: '#FFD600',
              channel_id: message.channelId ?? 'ride-taxi-found-v2',
              click_action: pushDeepLink(message.data),
              click_action_type: 1,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  const payload = await response.json().catch(() => ({})) as {
    error?: { message?: string; status?: string };
  };
  if (response.ok) return 'sent';
  if (
    response.status === 404 ||
    payload.error?.status === 'NOT_FOUND' ||
    payload.error?.status === 'UNREGISTERED'
  ) {
    await db.execute('DELETE FROM push_tokens WHERE token = ?', [token]);
    return 'removed';
  }
  throw new Error(
    payload.error?.message ?? payload.error?.status ?? `RuStore Push API returned ${response.status}`,
  );
}

export async function notifyUsers(
  userIds: string[],
  message: PushMessage,
): Promise<{ nativeSubscriptions: number; webSubscriptions: number }> {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return { nativeSubscriptions: 0, webSubscriptions: 0 };
  const placeholders = uniqueUserIds.map(() => '?').join(',');
  const [rows] = await db.query<NativePushTokenRow[]>(
    `SELECT token, provider FROM push_tokens WHERE user_id IN (${placeholders})`,
    uniqueUserIds,
  );
  const expoRows = rows.filter((row) => row.provider !== 'rustore');
  const rustoreRows = rows.filter((row) => row.provider === 'rustore');
  const errors: Error[] = [];
  for (const batch of chunks(expoRows, expoPushBatchSize)) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        ...(config.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(batch.map(({ token }) => ({
        to: token,
        sound: message.sound ?? 'taxi_found.wav',
        priority: 'high',
        channelId: message.channelId ?? 'ride-taxi-found-v2',
        title: message.title,
        body: message.body,
        data: message.data,
      }))),
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({})) as {
      data?: ExpoPushTicket[];
      errors?: { message?: string }[];
    };
    if (!response.ok) {
      throw new Error(
        payload.errors?.[0]?.message ?? `Expo Push API returned ${response.status}`,
      );
    }
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    for (const [index, ticket] of tickets.entries()) {
      if (ticket.status !== 'error') continue;
      const token = batch[index]?.token;
      if (ticket.details?.error === 'DeviceNotRegistered' && token) {
        await db.execute('DELETE FROM push_tokens WHERE token = ?', [token]);
        continue;
      }
      errors.push(new Error(ticket.message ?? ticket.details?.error ?? 'Expo push ticket error'));
    }
  }
  if (rustoreRows.length && (!config.RUSTORE_PUSH_PROJECT_ID || !config.RUSTORE_PUSH_SERVICE_TOKEN)) {
    errors.push(new Error('RuStore push tokens exist, but the RuStore Push API is not configured'));
  } else {
    for (const batch of chunks(rustoreRows, rustorePushBatchSize)) {
      const results = await Promise.allSettled(
        batch.map(({ token }) => sendRuStorePush(token, message)),
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(
            result.reason instanceof Error
              ? result.reason
              : new Error('RuStore push delivery failed'),
          );
        }
      }
    }
  }
  const [webRows] = await db.query<(
    RowDataPacket & { endpoint: string; p256dh: string; auth_secret: string }
  )[]>(
    `SELECT endpoint, p256dh, auth_secret
     FROM web_push_subscriptions WHERE user_id IN (${placeholders})`,
    uniqueUserIds,
  );
  if (webRows.length) {
    const vapid = getVapidConfig();
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const url = message.data?.orderId
      ? message.data.chat === 'true'
        ? `/chat/${message.data.orderId}`
        : message.data.role === 'driver'
          ? `/driver/trips/${message.data.orderId}`
          : `/orders/${message.data.orderId}`
      : '/';
    for (const subscription of webRows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
          },
          JSON.stringify({ title: message.title, body: message.body, url }),
          { TTL: 86_400, urgency: 'high' },
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.execute(
            'DELETE FROM web_push_subscriptions WHERE endpoint_hash = ?',
            [endpointHash(subscription.endpoint)],
          );
        } else {
          errors.push(error instanceof Error ? error : new Error('Web Push delivery failed'));
        }
      }
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, `Failed to deliver ${errors.length} push notification(s)`);
  }
  return { nativeSubscriptions: rows.length, webSubscriptions: webRows.length };
}

export async function notifyOnlineDrivers(message: PushMessage): Promise<void> {
  const [rows] = await db.query<(RowDataPacket & { user_id: string })[]>(
    "SELECT user_id FROM drivers WHERE status = 'online'",
  );
  await notifyUsers(rows.map((row) => row.user_id), message);
}

export async function notifyDrivers(driverIds: string[], message: PushMessage): Promise<void> {
  const uniqueDriverIds = [...new Set(driverIds)];
  if (!uniqueDriverIds.length) return;
  const placeholders = uniqueDriverIds.map(() => '?').join(',');
  const [rows] = await db.query<(RowDataPacket & { user_id: string })[]>(
    `SELECT user_id FROM drivers WHERE id IN (${placeholders})`,
    uniqueDriverIds,
  );
  await notifyUsers(rows.map((row) => row.user_id), message);
}
