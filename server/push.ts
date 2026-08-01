import type { RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db } from './db';

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: string;
  channelId?:
    | 'ride-taxi-found-v2'
    | 'ride-driver-arrived-v2'
    | 'driver-orders-v2'
    | 'ride-complete-v2'
    | 'ride-cancelled-v2';
};

export async function notifyUsers(userIds: string[], message: PushMessage): Promise<void> {
  if (!userIds.length) return;
  const placeholders = userIds.map(() => '?').join(',');
  const [rows] = await db.query<(RowDataPacket & { token: string })[]>(
    `SELECT token FROM push_tokens WHERE user_id IN (${placeholders})`,
    userIds,
  );
  if (!rows.length) return;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      ...(config.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(
      rows.map(({ token }) => ({
        to: token,
        sound: message.sound ?? 'taxi_found.wav',
        priority: 'high',
        channelId: message.channelId ?? 'ride-taxi-found-v2',
        title: message.title,
        body: message.body,
        data: message.data,
      })),
    ),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Expo Push API returned ${response.status}`);
}

export async function notifyOnlineDrivers(message: PushMessage): Promise<void> {
  const [rows] = await db.query<(RowDataPacket & { user_id: string })[]>(
    "SELECT user_id FROM drivers WHERE status = 'online'",
  );
  await notifyUsers(rows.map((row) => row.user_id), message);
}
