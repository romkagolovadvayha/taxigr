import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../server/db';

const transport = vi.hoisted(() => ({ edit: vi.fn() }));
vi.mock('../server/messenger-notifications', () => ({
  editOrderMessage: transport.edit, notifyMessengerAccount: vi.fn(), appUrl: (path: string) => `https://taxi.example${path}`,
}));
import { syncMessengerOrderMessages } from '../server/messenger-order-sync';

describe.skipIf(process.env.RUN_API_INTEGRATION !== '1')('order message sync with MySQL', () => {
  const passenger = randomUUID(), assignedUser = randomUUID(), otherDriver = randomUUID();
  const driver = randomUUID(), orderId = randomUUID();
  const accounts: number[] = [];
  const searchingVersion = new Date('2026-11-12T10:00:00.000Z');

  beforeAll(async () => {
    for (const id of [passenger, assignedUser, otherDriver]) {
      await db.execute('INSERT INTO users (id, vk_id, name) VALUES (?, ?, ?)', [id, id, 'Sync test']);
      const [result] = await db.execute<import('mysql2/promise').ResultSetHeader>(
        `INSERT INTO user_messenger_accounts (user_id, provider, external_user_id, chat_id)
         VALUES (?, 'vk', ?, ?)`, [id, id, id],
      );
      accounts.push(result.insertId);
    }
    await db.execute('INSERT INTO drivers (id, user_id, status) VALUES (?, ?, ?)', [driver, assignedUser, 'online']);
  });
  afterAll(async () => {
    await db.execute('DELETE FROM orders WHERE id = ?', [orderId]);
    await db.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [passenger, assignedUser, otherDriver]);
    await db.end();
  });
  beforeEach(async () => {
    transport.edit.mockReset().mockResolvedValue(undefined);
    await db.execute('DELETE FROM orders WHERE id = ?', [orderId]);
    await db.execute(
      `INSERT INTO orders (id, passenger_id, tariff, status, pickup_label, pickup_lat, pickup_lon,
        destination_label, destination_lat, destination_lon, distance_meters, duration_seconds,
        price_minor, base_price_minor, commission_minor, commission_bps, idempotency_key, updated_at)
       VALUES (?, ?, 'economy', 'searching', 'Советская 10', 56, 52, 'Школьная 5', 56.01, 52.01,
         1000, 300, 20000, 20000, 0, 0, ?, ?)`, [orderId, passenger, orderId, searchingVersion],
    );
  });
  async function track(account: number, id: string, audience: string) {
    await db.execute(`INSERT INTO messenger_order_messages
      (order_id, messenger_account_id, audience, message_id, synced_order_updated_at)
      VALUES (?, ?, ?, ?, ?)`, [orderId, account, audience, id, searchingVersion]);
  }
  async function accept() {
    await db.execute(`UPDATE orders SET driver_id = ?, active_driver_id = ?, status = 'accepted',
      updated_at = DATE_ADD(?, INTERVAL 1 SECOND) WHERE id = ?`, [driver, driver, searchingVersion, orderId]);
  }

  it('repairs an offer tracked after acceptance, then leaves unchanged messages alone', async () => {
    await accept();
    await track(accounts[2]!, 'message:late', 'driver');
    await syncMessengerOrderMessages({ orderId });
    expect(transport.edit).toHaveBeenCalledOnce();
    expect(transport.edit.mock.calls[0]![2]).toMatchObject({ title: 'Заказ уже взят', buttons: [] });
    const [rows] = await db.query<RowDataPacket[]>(`SELECT mom.synced_order_updated_at = o.updated_at AS fresh
      FROM messenger_order_messages mom JOIN orders o ON o.id=mom.order_id WHERE o.id=?`, [orderId]);
    expect(rows[0]!.fresh).toBe(1);
    await syncMessengerOrderMessages({ orderId });
    expect(transport.edit).toHaveBeenCalledOnce();
  });

  it('retains failed work across polling cycles and updates a passenger after the driver took the order', async () => {
    await track(accounts[2]!, 'message:other', 'driver');
    await track(accounts[0]!, 'message:passenger', 'passenger');
    await accept();
    transport.edit.mockRejectedValueOnce(new Error('network timeout'));
    await expect(syncMessengerOrderMessages({ orderId })).rejects.toThrow('retries scheduled');
    expect(transport.edit).toHaveBeenCalledTimes(2);
    expect(transport.edit.mock.calls[1]![2].title).toBe('Машина найдена');
    const [rows] = await db.query<RowDataPacket[]>(`SELECT sync_attempts, last_sync_error,
      next_sync_at > UTC_TIMESTAMP(3) AS waiting FROM messenger_order_messages WHERE message_id='message:other' AND order_id=?`, [orderId]);
    expect(rows[0]).toMatchObject({ sync_attempts: 1, waiting: 1, last_sync_error: 'Error: network timeout' });
    await syncMessengerOrderMessages({ orderId });
    expect(transport.edit).toHaveBeenCalledTimes(2);
    await db.execute('UPDATE messenger_order_messages SET next_sync_at=UTC_TIMESTAMP(3) WHERE order_id=?', [orderId]);
    await syncMessengerOrderMessages({ orderId });
    expect(transport.edit).toHaveBeenCalledTimes(3);
    expect(transport.edit.mock.calls[2]![2]).toMatchObject({ title: 'Заказ уже взят', buttons: [] });
  });

  it('serializes competing workers and closes a passenger-cancelled offer', async () => {
    await track(accounts[2]!, 'message:cancelled', 'driver');
    await db.execute(`UPDATE orders SET status='cancelled', updated_at=DATE_ADD(?, INTERVAL 1 SECOND) WHERE id=?`,
      [searchingVersion, orderId]);
    let release!: () => void;
    transport.edit.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = syncMessengerOrderMessages({ orderId });
    await vi.waitFor(() => expect(transport.edit).toHaveBeenCalledOnce());
    try {
      await syncMessengerOrderMessages({ orderId });
      expect(transport.edit).toHaveBeenCalledOnce();
      expect(transport.edit.mock.calls[0]![2]).toMatchObject({ title: 'Заказ отменён', buttons: [] });
    } finally { release(); await first; }
  });
});
