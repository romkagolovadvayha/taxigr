import type { FastifyInstance } from 'fastify';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db, firstRow } from './db';
import { editOrderMessage, notifyMessengerAccount, type PersonalMessengerNotification } from './messenger-notifications';
import { orderSelect, presentOrder, type OrderRow } from './presenters';
import { driverRideNotification, passengerRideNotification, unavailableDriverOrderNotification } from './ride-messenger';

type SyncOptions = {
  orderId?: string;
  accountId?: number;
  messageId?: string;
  excludeUserId?: string;
  audience?: 'driver' | 'passenger';
  force?: boolean;
};

type PendingMessage = RowDataPacket & {
  tracking_id: number;
  id: number;
  user_id: string;
  provider: 'max' | 'telegram' | 'vk';
  external_user_id: string;
  chat_id: string;
  message_id: string;
  order_id: string;
  audience: 'driver' | 'passenger';
  sync_attempts: number;
  created_at: Date;
  synced_order_updated_at: Date | null;
};

async function syncMessage(row: PendingMessage, getOrder: () => Promise<OrderRow | null>): Promise<void> {
  const configured = row.provider === 'max' ? config.MAX_BOT_TOKEN
    : row.provider === 'telegram' ? config.TELEGRAM_BOT_TOKEN : config.VK_BOT_TOKEN;
  if (!configured) return;
  const [claim] = await db.execute<ResultSetHeader>(
    `UPDATE messenger_order_messages
     SET sync_locked_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 MINUTE), sync_attempts = sync_attempts + 1
     WHERE id = ? AND sync_attempts = ?
       AND synced_order_updated_at <=> ?
       AND (sync_locked_until IS NULL OR sync_locked_until <= UTC_TIMESTAMP(3))`,
    [row.tracking_id, row.sync_attempts, row.synced_order_updated_at],
  );
  if (!claim.affectedRows) return;
  const attempt = row.sync_attempts + 1;
  try {
    const current = await getOrder();
    if (!current) return;
    const ride = presentOrder(current);
    let notification: PersonalMessengerNotification;
    if (row.audience === 'passenger' && current.passenger_id === row.user_id) {
      notification = passengerRideNotification(ride);
    } else if (row.audience === 'driver' && (current.driver_user_id === row.user_id ||
      (current.status === 'searching' && !current.driver_id))) {
      notification = driverRideNotification(ride);
    } else {
      notification = unavailableDriverOrderNotification(ride);
    }
    try {
      await editOrderMessage(row, row.message_id, notification);
    } catch (error) {
      // Telegram reports an already applied edit as an error after a retry.
      const description = error instanceof Error ? error.message : '';
      const removed = /message(?:[ ._]to[ ._]edit)?[ ._](?:not[ ._]found|has[ ._]been[ ._]deleted)/iu.test(description);
      const expired = (error as { vkCode?: number } | null)?.vkCode === 909 ||
        /message (?:can.t be edited|is too old)|edit.*(?:expired|too old)/iu.test(description);
      if (removed || expired) {
        // Immutable historical messages cannot be retried successfully. A fresh
        // status replaces a recent card, while deleted cards stay deleted.
        if (expired && Date.now() - new Date(row.created_at).getTime() < 48 * 60 * 60_000) {
          await notifyMessengerAccount(row.provider, row.external_user_id, notification);
        }
        await db.execute(
          `UPDATE messenger_order_messages SET sync_disabled_at = UTC_TIMESTAMP(3),
             sync_locked_until = NULL, last_sync_error = ? WHERE id = ? AND sync_attempts = ?`,
          [description.slice(0, 500), row.tracking_id, attempt],
        );
        return;
      }
      if (!/message[ .]is[ .]not[ .]modified|message[.]not[.]modified/iu.test(description)) throw error;
    }
    await db.execute(
      `UPDATE messenger_order_messages SET synced_order_updated_at = ?, next_sync_at = UTC_TIMESTAMP(3),
         sync_attempts = 0, last_sync_error = NULL, sync_locked_until = NULL
       WHERE id = ? AND sync_attempts = ?`,
      [new Date(ride.updatedAt), row.tracking_id, attempt],
    );
  } catch (error) {
    const delay = Math.min(900, 5 * 2 ** Math.min(attempt - 1, 8));
    const description = error instanceof Error ? `${error.name}: ${error.message}` : 'Message update failed';
    await db.execute(
      `UPDATE messenger_order_messages SET next_sync_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND),
         last_sync_error = ?, sync_locked_until = NULL WHERE id = ? AND sync_attempts = ?`,
      [delay, description.slice(0, 500), row.tracking_id, attempt],
    );
    throw error;
  }
}

export async function syncMessengerOrderMessages(options: SyncOptions = {}): Promise<void> {
  const providers = [
    config.MAX_BOT_TOKEN ? 'max' : null, config.TELEGRAM_BOT_TOKEN ? 'telegram' : null, config.VK_BOT_TOKEN ? 'vk' : null,
  ].filter((provider): provider is string => provider !== null);
  if (!providers.length) return;
  const conditions = ['uma.active = TRUE', 'uma.bot_contact_available = TRUE',
    'mom.sync_disabled_at IS NULL',
    `uma.provider IN (${providers.map(() => '?').join(',')})`,
    '(mom.sync_locked_until IS NULL OR mom.sync_locked_until <= UTC_TIMESTAMP(3))'];
  const values: unknown[] = [...providers];
  if (!options.force) {
    conditions.push('mom.next_sync_at <= UTC_TIMESTAMP(3)',
      '(mom.synced_order_updated_at IS NULL OR mom.synced_order_updated_at < o.updated_at)');
  }
  for (const [column, value] of [
    ['mom.order_id', options.orderId], ['mom.messenger_account_id', options.accountId],
    ['mom.message_id', options.messageId], ['mom.audience', options.audience],
  ] as const) {
    if (value === undefined) continue;
    conditions.push(`${column} = ?`);
    values.push(value);
  }
  if (options.excludeUserId) {
    conditions.push('uma.user_id <> ?');
    values.push(options.excludeUserId);
  }
  const [rows] = await db.query<PendingMessage[]>(
    `SELECT mom.id AS tracking_id, mom.order_id, mom.message_id, mom.audience, mom.sync_attempts, mom.created_at,
       mom.synced_order_updated_at,
       uma.id, uma.user_id, uma.provider, uma.external_user_id, uma.chat_id
     FROM messenger_order_messages mom
     JOIN orders o ON o.id = mom.order_id
     JOIN user_messenger_accounts uma ON uma.id = mom.messenger_account_id
     WHERE ${conditions.join(' AND ')} ORDER BY mom.next_sync_at, mom.id LIMIT 40`, values,
  );
  const failures: unknown[] = [];
  const orders = new Map<string, Promise<OrderRow | null>>();
  for (let offset = 0; offset < rows.length; offset += 4) {
    const results = await Promise.allSettled(rows.slice(offset, offset + 4).map(row => {
      return syncMessage(row, () => {
        let order = orders.get(row.order_id);
        if (!order) {
          order = firstRow<OrderRow>(`${orderSelect} WHERE o.id = ?`, [row.order_id]);
          orders.set(row.order_id, order);
        }
        return order;
      });
    }));
    failures.push(...results.flatMap(result => result.status === 'rejected' ? [result.reason] : []));
  }
  if (failures.length) throw new AggregateError(failures, `Failed to update ${failures.length} order messages; retries scheduled`);
}

export function registerMessengerOrderSync(app: FastifyInstance): void {
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending) return;
    pending = syncMessengerOrderMessages()
      .catch(error => app.log.warn({ error }, 'messenger order status sync failed; retries scheduled'))
      .finally(() => { pending = undefined; });
  }, 10_000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await pending;
  });
}
