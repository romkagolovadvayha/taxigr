import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RideOrder } from '../src/domain/models';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), firstRow: vi.fn(), edit: vi.fn(), notify: vi.fn() }));
vi.mock('../server/config', () => ({ config: {
  MAX_BOT_TOKEN: 'max', TELEGRAM_BOT_TOKEN: 'telegram', VK_BOT_TOKEN: 'vk', PUBLIC_URL: 'https://taxi.example',
} }));
vi.mock('../server/db', () => ({ db: { query: mocks.query, execute: mocks.execute }, firstRow: mocks.firstRow }));
vi.mock('../server/messenger-notifications', () => ({
  editOrderMessage: mocks.edit, notifyMessengerAccount: mocks.notify, appUrl: (path: string) => `https://taxi.example${path}`,
}));
vi.mock('../server/presenters', () => ({ orderSelect: 'SELECT o.* FROM orders o', presentOrder: (row: { ride: RideOrder }) => row.ride }));
import { syncMessengerOrderMessages } from '../server/messenger-order-sync';

const updatedAt = '2026-11-12T12:00:01.000Z';
const ride: RideOrder = {
  id: '123e4567-e89b-12d3-a456-426614174000', passengerId: 'passenger', driverId: 'driver',
  status: 'accepted', tariff: 'economy', paymentMethod: 'cash', createdAt: '2026-11-12T12:00:00.000Z', updatedAt,
  pickup: { id: 'from', label: 'с. Грахово, Советская, 10', coordinates: { latitude: 56, longitude: 52 } },
  destination: { id: 'to', label: 'с. Грахово, Школьная, 5', coordinates: { latitude: 56.01, longitude: 52.01 } },
  priceMinor: 20000, serviceCommissionMinor: 0, distanceMeters: 1500, durationSeconds: 300,
  passenger: { id: 'passenger', name: 'Пассажир', phone: '+79991112233', rating: 5, ratingCount: 0 },
};
const message = (id: number, userId = 'other-driver', audience = 'driver', provider = 'vk') => ({
  tracking_id: id, id, user_id: userId, audience, provider, external_user_id: 'external-' + id,
  chat_id: 'chat-' + id, message_id: 'message:' + id, order_id: ride.id, sync_attempts: 0, created_at: new Date(),
  synced_order_updated_at: null,
});
const current = (overrides: Partial<RideOrder> = {}) => ({
  passenger_id: 'passenger', driver_id: overrides.driverId ?? 'driver', driver_user_id: 'assigned-driver',
  status: overrides.status ?? 'accepted', ride: { ...ride, ...overrides },
});

describe('durable order message synchronization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
    mocks.firstRow.mockResolvedValue(current());
    mocks.edit.mockResolvedValue(undefined);
  });

  it.each(['vk', 'max', 'telegram'])('closes losing offers without buttons or private passenger details in %s', async provider => {
    mocks.query.mockResolvedValue([[message(1, 'other-driver', 'driver', provider)]]);
    await syncMessengerOrderMessages();
    const notification = mocks.edit.mock.calls[0]![2];
    expect(notification.title).toBe('Заказ уже взят');
    expect(notification.buttons).toEqual([]);
    expect(JSON.stringify(notification)).not.toContain('+79991112233');
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining('synced_order_updated_at = ?'),
      [new Date(updatedAt), 1, 1]);
  });

  it('uses the latest order state for both participants while preserving assigned-driver controls', async () => {
    mocks.query.mockResolvedValue([[message(1, 'assigned-driver'), message(2, 'passenger', 'passenger')]]);
    await syncMessengerOrderMessages();
    expect(mocks.firstRow).toHaveBeenCalledOnce();
    expect(mocks.edit.mock.calls[0]![2].title).toBe('Заказ принят');
    expect(mocks.edit.mock.calls[1]![2].title).toBe('Машина найдена');
    expect(JSON.stringify(mocks.edit.mock.calls[0]![2].buttons)).not.toContain('r:a:');
  });

  it('closes offers cancelled before any driver accepted', async () => {
    const order = current({ status: 'cancelled', driverId: undefined });
    order.driver_id = '';
    mocks.firstRow.mockResolvedValue(order);
    mocks.query.mockResolvedValue([[message(1)]]);
    await syncMessengerOrderMessages();
    expect(mocks.edit.mock.calls[0]![2]).toMatchObject({ title: 'Заказ отменён', buttons: [] });
  });

  it('persists retry details after one platform fails and still updates other accounts', async () => {
    mocks.query.mockResolvedValue([[message(1), message(2)]]);
    mocks.edit.mockRejectedValueOnce(new Error('temporary VK timeout'));
    await expect(syncMessengerOrderMessages()).rejects.toThrow('retries scheduled');
    expect(mocks.edit).toHaveBeenCalledTimes(2);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('last_sync_error = ?'),
      [5, 'Error: temporary VK timeout', 1, 1]);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('synced_order_updated_at = ?'),
      [new Date(updatedAt), 2, 1]);
  });

  it('backs off repeated failures and accepts Telegram already-applied edits', async () => {
    mocks.query.mockResolvedValue([[{ ...message(1), sync_attempts: 8 }]]);
    mocks.edit.mockRejectedValueOnce(new Error('temporary network failure'));
    await expect(syncMessengerOrderMessages()).rejects.toThrow();
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining('last_sync_error = ?'),
      [900, 'Error: temporary network failure', 1, 9]);
    mocks.query.mockResolvedValue([[message(2, 'other-driver', 'driver', 'telegram')]]);
    mocks.edit.mockRejectedValueOnce(new Error('Bad Request: message is not modified'));
    await syncMessengerOrderMessages();
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining('synced_order_updated_at = ?'),
      [new Date(updatedAt), 2, 1]);
  });

  it('skips a message claimed by another worker and makes no platform calls for synchronized messages', async () => {
    mocks.query.mockResolvedValue([[message(1)]]);
    mocks.execute.mockResolvedValue([{ affectedRows: 0 }]);
    await syncMessengerOrderMessages();
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.firstRow).not.toHaveBeenCalled();
    mocks.query.mockResolvedValue([[]]);
    await syncMessengerOrderMessages();
    expect(mocks.query.mock.calls.at(-1)![0]).toContain('mom.synced_order_updated_at < o.updated_at');
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it('refreshes a failed accept button from the current state instead of hiding an available order', async () => {
    const searching = current({ status: 'searching', driverId: undefined });
    searching.driver_id = '';
    mocks.firstRow.mockResolvedValue(searching);
    mocks.query.mockResolvedValue([[message(1)]]);
    await syncMessengerOrderMessages({ accountId: 1, orderId: ride.id, force: true });
    expect(JSON.stringify(mocks.edit.mock.calls[0]![2].buttons)).toContain('r:a:');
  });

  it('replaces a recent card when VK rejects editing an old message and retires its retries', async () => {
    mocks.query.mockResolvedValue([[message(1)]]);
    mocks.edit.mockRejectedValueOnce(Object.assign(new Error('Cannot edit old message'), { vkCode: 909 }));
    await syncMessengerOrderMessages();
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('vk', 'external-1',
      expect.objectContaining({ title: 'Заказ уже взят', buttons: [] }));
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining('sync_disabled_at = UTC_TIMESTAMP(3)'),
      ['Cannot edit old message', 1, 1]);
  });

  it('stops retrying deleted messages without sending another message', async () => {
    mocks.query.mockResolvedValue([[message(1)]]);
    mocks.edit.mockRejectedValueOnce(new Error('message.not_found'));
    await syncMessengerOrderMessages();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining('sync_disabled_at = UTC_TIMESTAMP(3)'),
      ['message.not_found', 1, 1]);
  });
});
