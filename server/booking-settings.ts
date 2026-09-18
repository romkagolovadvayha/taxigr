import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { bookingUnavailableCode, bookingUnavailableMessage, type BookingAvailability } from '../src/domain/booking-availability';
import { db, withTransaction } from './db';

export async function readBookingSettings(connection?: PoolConnection): Promise<BookingAvailability> {
  const [rows] = await (connection ?? db).query<(RowDataPacket & { enabled: number })[]>(
    `SELECT enabled FROM booking_settings WHERE id = 1${connection ? ' LOCK IN SHARE MODE' : ''}`,
  );
  if (!rows[0]) throw new Error('Настройка заказа отсутствует. Выполните миграции базы данных.');
  return { enabled: Number(rows[0].enabled) === 1 };
}

export async function assertBookingEnabled(connection?: PoolConnection) {
  if (!(await readBookingSettings(connection)).enabled) {
    throw Object.assign(new Error(bookingUnavailableMessage), { statusCode: 409, code: bookingUnavailableCode });
  }
}

export async function saveBookingSettings(input: BookingAvailability, actorId: string, ip?: string) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query<(RowDataPacket & { enabled: number })[]>(
      'SELECT enabled FROM booking_settings WHERE id = 1 FOR UPDATE',
    );
    if (!rows[0]) throw new Error('Настройка заказа отсутствует. Выполните миграции базы данных.');
    const before = { enabled: Number(rows[0].enabled) === 1 };
    await connection.execute('UPDATE booking_settings SET enabled = ?, updated_by = ? WHERE id = 1', [input.enabled, actorId]);
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
       VALUES (?, 'booking_settings.update', 'booking_settings', '1', ?, ?, ?)`,
      [actorId, JSON.stringify(before), JSON.stringify(input), ip ?? null],
    );
    return input;
  });
}
