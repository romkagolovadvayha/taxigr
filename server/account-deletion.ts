import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';

import { withTransaction } from './db';
import { authenticate } from './security';

export function registerAccountDeletion(app: FastifyInstance, disconnectUser: (id: string) => void) {
  app.delete('/v1/me', async (request) => {
    const session = await authenticate(request);
    if ((request.body as { confirmation?: unknown } | null)?.confirmation !== 'DELETE_ACCOUNT') {
      throw Object.assign(new Error('Подтвердите удаление аккаунта'), { statusCode: 400 });
    }
    await withTransaction(async (connection) => {
      // Booking creation locks this same user row. Clear the phone before any
      // waiting booking can proceed, while preserving historical order records.
      const [users] = await connection.query<(RowDataPacket & { phone: string | null })[]>(
        'SELECT phone FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [session.id],
      );
      if (!users[0]) throw Object.assign(new Error('Сессия недействительна'), { statusCode: 401 });
      const [roles] = await connection.query<(RowDataPacket & { role: string })[]>(
        'SELECT role FROM user_roles WHERE user_id = ?', [session.id],
      );
      if (roles.some(({ role }) => role === 'admin' || role === 'super_admin')) {
        throw Object.assign(new Error('Сначала передайте права администратора через поддержку'), { statusCode: 409 });
      }
      // Acceptance locks the driver row; a deleted driver cannot accept a new trip.
      const [drivers] = await connection.query<(RowDataPacket & { id: string })[]>(
        'SELECT id FROM drivers WHERE user_id = ? FOR UPDATE', [session.id],
      );
      const driverId = drivers[0]?.id ?? null;
      const [orders] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM orders WHERE (passenger_id = ? OR driver_id = ?)
         AND status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress') LIMIT 1`,
        [session.id, driverId],
      );
      if (orders.length) throw Object.assign(new Error('Сначала завершите или отмените активные заказы'), { statusCode: 409 });
      if (driverId) {
        await connection.execute("UPDATE drivers SET status = 'suspended' WHERE id = ?", [driverId]);
        await connection.execute('UPDATE vehicles SET active = FALSE WHERE driver_id = ?', [driverId]);
        await connection.execute('DELETE FROM driver_locations WHERE driver_id = ?', [driverId]);
        await connection.execute('UPDATE driver_shifts SET ended_at = UTC_TIMESTAMP(3) WHERE driver_id = ? AND ended_at IS NULL', [driverId]);
      }
      await connection.execute(
        `UPDATE users SET deleted_at = UTC_TIMESTAMP(3), name = 'Удалённый аккаунт',
         phone = NULL, phone_verified_at = NULL, vk_id = NULL, gender = NULL,
         avatar_url = NULL, avatar_mime = NULL, avatar_data = NULL, profile_completed_at = NULL
         WHERE id = ?`, [session.id],
      );
      for (const table of ['session_codes', 'push_tokens', 'web_push_subscriptions', 'user_messenger_accounts']) {
        await connection.execute(`DELETE FROM ${table} WHERE user_id = ?`, [session.id]);
      }
      await connection.execute('DELETE FROM passenger_locations WHERE passenger_id = ?', [session.id]);
      if (users[0].phone) {
        await connection.execute('DELETE FROM phone_auth_challenges WHERE phone = ?', [users[0].phone]);
        for (const table of ['max_auth_challenges', 'telegram_auth_challenges', 'vk_auth_challenges']) {
          await connection.execute(`DELETE FROM ${table} WHERE expected_phone = ?`, [users[0].phone]);
        }
      }
      await connection.execute(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
         VALUES (?, 'account.delete', 'user', ?)`, [session.id, session.id],
      );
    }, { isolationLevel: 'READ COMMITTED' });
    disconnectUser(session.id);
    return { data: { deleted: true } };
  });
}
