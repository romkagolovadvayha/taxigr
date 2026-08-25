import type { RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db } from './db';

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
    | 'ride-complete-v2'
    | 'ride-cancelled-v2';
};

type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

const expoPushBatchSize = 100;

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

export async function notifyUsers(userIds: string[], message: PushMessage): Promise<void> {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return;
  const placeholders = uniqueUserIds.map(() => '?').join(',');
  const [rows] = await db.query<(RowDataPacket & { token: string })[]>(
    `SELECT token FROM push_tokens WHERE user_id IN (${placeholders})`,
    uniqueUserIds,
  );
  if (!rows.length) return;
  const errors: Error[] = [];
  for (const batch of chunks(rows, expoPushBatchSize)) {
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
      errors?: Array<{ message?: string }>;
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
  if (errors.length) {
    throw new AggregateError(errors, `Expo rejected ${errors.length} push notification(s)`);
  }
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
