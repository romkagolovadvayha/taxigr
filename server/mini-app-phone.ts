import type { RowDataPacket } from 'mysql2/promise';

import { db } from './db';

// Called only after the Telegram webhook secret and contact owner were checked.
// This consumes no browser login challenge and sends no extra chat messages.
export async function recordTelegramMiniAppContact(userId: string, chatId: string, phone: string): Promise<boolean> {
  if (userId !== chatId) return false;
  await db.execute(
    `UPDATE mini_app_phone_challenges SET verified_phone = ?, verified_at = COALESCE(verified_at, UTC_TIMESTAMP(3))
     WHERE external_user_id = ? AND expires_at > UTC_TIMESTAMP(3)
       AND verified_at IS NULL AND consumed_at IS NULL`,
    [phone, userId],
  );
  // Telegram may retry the webhook after a timeout, including after login was
  // consumed. A duplicate must not fall through into another booking flow.
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT request_id FROM mini_app_phone_challenges WHERE external_user_id = ?
     AND verified_phone = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`, [userId, phone],
  );
  return rows.length > 0;
}
