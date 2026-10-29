import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { RideOrder } from '../src/domain/models';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  firstRow: vi.fn(),
  findUserWithRoles: vi.fn(),
  notifyMessengerAccount: vi.fn(),
  refreshMessengerAccountOrderMessages: vi.fn(),
  signSession: vi.fn(),
}));

vi.mock('../server/db', () => ({
  db: { execute: mocks.execute },
  firstRow: mocks.firstRow,
}));

vi.mock('../server/repositories', () => ({
  findUserWithRoles: mocks.findUserWithRoles,
}));

vi.mock('../server/security', () => ({
  signSession: mocks.signSession,
}));

vi.mock('../server/messenger-notifications', () => ({
  appUrl: (path: string) => `https://taxi.example${path}`,
  notifyMessengerAccount: mocks.notifyMessengerAccount,
  refreshMessengerAccountOrderMessages: mocks.refreshMessengerAccountOrderMessages,
}));

import { createMessengerOrderActionHandler } from '../server/messenger-order-actions';

const orderId = '123e4567-e89b-12d3-a456-426614174000';

function order(overrides: Partial<RideOrder> = {}): RideOrder {
  return {
    id: orderId,
    passengerId: 'passenger-user',
    pickup: {
      id: 'pickup',
      label: 'ул. Юбилейная, 5',
      coordinates: { latitude: 56.05, longitude: 52.99 },
    },
    destination: {
      id: 'destination',
      label: 'ул. Ачинцева, 2а',
      coordinates: { latitude: 56.06, longitude: 53 },
    },
    tariff: 'economy',
    status: 'searching',
    priceMinor: 15_000,
    serviceCommissionMinor: 1_500,
    distanceMeters: 2_000,
    durationSeconds: 300,
    paymentMethod: 'cash',
    createdAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}

function response(data: RideOrder, statusCode = 200) {
  return {
    statusCode,
    json: () => ({ data }),
  };
}

describe('messenger order actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([{}]);
    mocks.signSession.mockResolvedValue('internal-session');
    mocks.notifyMessengerAccount.mockResolvedValue(undefined);
    mocks.refreshMessengerAccountOrderMessages.mockResolvedValue(undefined);
  });

  it('rejects a callback coming from a different Telegram chat', async () => {
    mocks.firstRow.mockResolvedValueOnce({ user_id: 'user-1', chat_id: 'expected-chat' });
    const inject = vi.fn();
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);

    const result = await handle({
      provider: 'telegram',
      externalUserId: '42',
      chatId: 'another-chat',
      data: `r:refresh:${orderId}`,
    });

    expect(result.alert).toBe(true);
    expect(inject).not.toHaveBeenCalled();
  });

  it('accepts an offer through the existing protected driver endpoint', async () => {
    const accepted = order({
      status: 'accepted',
      driverId: 'driver-1',
    });
    mocks.firstRow
      .mockResolvedValueOnce({ user_id: 'driver-user', chat_id: 'max-chat' })
      .mockResolvedValueOnce({ id: 'driver-1' });
    mocks.findUserWithRoles.mockResolvedValue({
      id: 'driver-user',
      roles: ['driver'],
      blockedAt: undefined,
    });
    const inject = vi.fn().mockResolvedValue(response(accepted));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);

    const result = await handle({
      provider: 'max',
      externalUserId: 'max-user',
      data: `r:a:${orderId}`,
    });

    expect(result).toEqual({ text: 'Заказ принят ✅' });
    expect(inject).toHaveBeenCalledOnce();
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: `/v1/driver/orders/${orderId}/accept`,
      headers: { authorization: 'Bearer internal-session' },
    }));
  });

  it('asks for explicit confirmation before passenger cancellation', async () => {
    mocks.firstRow.mockResolvedValueOnce({ user_id: 'passenger-user', chat_id: 'tg-chat' });
    mocks.findUserWithRoles.mockResolvedValue({
      id: 'passenger-user',
      roles: ['passenger'],
      blockedAt: undefined,
    });
    const inject = vi.fn().mockResolvedValue(response(order()));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);

    const result = await handle({
      provider: 'telegram',
      externalUserId: '42',
      chatId: 'tg-chat',
      data: `r:cancel:${orderId}`,
    });

    expect(result.text).toContain('Подтвердите');
    expect(inject).toHaveBeenCalledTimes(1);
    expect(mocks.notifyMessengerAccount).toHaveBeenCalledWith(
      'telegram',
      '42',
      expect.objectContaining({
        title: 'Отменить заказ?',
        buttons: expect.arrayContaining([
          [expect.objectContaining({ intent: 'negative', data: `r:cancel-ok:${orderId}` })],
        ]),
      }),
    );
  });

  it('confirms payment when a driver completes a ride from a messenger', async () => {
    const inProgress = order({ status: 'in_progress', driverId: 'driver-1' });
    const completed = order({
      status: 'completed',
      driverId: 'driver-1',
      paymentConfirmedAt: '2026-08-25T10:10:00.000Z',
    });
    mocks.firstRow
      .mockResolvedValueOnce({ user_id: 'driver-user', chat_id: 'tg-chat' })
      .mockResolvedValueOnce({ id: 'driver-1' });
    mocks.findUserWithRoles.mockResolvedValue({
      id: 'driver-user',
      roles: ['driver'],
      blockedAt: undefined,
    });
    const inject = vi.fn()
      .mockResolvedValueOnce(response(inProgress))
      .mockResolvedValueOnce(response(completed));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);

    const result = await handle({
      provider: 'telegram',
      externalUserId: '42',
      chatId: 'tg-chat',
      data: `r:done-ok:${orderId}`,
    });

    expect(result).toEqual({ text: 'Поездка завершена 🏁' });
    expect(inject).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'POST',
      url: `/v1/driver/orders/${orderId}/transition`,
      payload: { status: 'completed', paymentReceived: true },
    }));
  });

  it.each(['telegram', 'vk', 'max'] as const)('cancels through the protected API in %s and handles repeated confirmation', async provider => {
    mocks.firstRow.mockResolvedValue({ user_id: 'passenger-user', chat_id: 'chat' });
    mocks.findUserWithRoles.mockResolvedValue({ id: 'passenger-user', roles: ['passenger'] });
    let current = order();
    const inject = vi.fn().mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'POST') current = order({ status: 'cancelled' });
      return response(current);
    });
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);
    const request = { provider, externalUserId: '42', chatId: 'chat', sourceMessageId: 'confirm-message', data: `r:cancel-ok:${orderId}` };

    expect(await handle(request)).toEqual({ text: 'Заказ отменён.' });
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', url: `/v1/orders/${orderId}/cancel`, headers: { authorization: 'Bearer internal-session' },
    }));
    expect(mocks.refreshMessengerAccountOrderMessages).toHaveBeenCalledWith(
      provider, '42', expect.objectContaining({ orderId, audience: 'passenger', title: expect.stringContaining('отмен') }), 'confirm-message',
    );
    expect(await handle(request)).toEqual({ text: 'Заказ уже отменён.' });
    expect(inject.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(1);
  });

  it('rejects a confirmation if the trip started after the cancellation prompt', async () => {
    mocks.firstRow.mockResolvedValue({ user_id: 'passenger-user', chat_id: 'chat' });
    mocks.findUserWithRoles.mockResolvedValue({ id: 'passenger-user', roles: ['passenger'] });
    const inject = vi.fn().mockResolvedValue(response(order({ status: 'in_progress' })));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);
    expect(await handle({ provider: 'telegram', externalUserId: '42', chatId: 'chat', data: `r:cancel-ok:${orderId}` }))
      .toEqual({ text: 'Заказ уже нельзя отменить.', alert: true });
    expect(inject).toHaveBeenCalledOnce();
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }));
  });

  it('does not cancel another passenger order', async () => {
    mocks.firstRow.mockResolvedValue({ user_id: 'someone-else', chat_id: 'chat' });
    mocks.findUserWithRoles.mockResolvedValue({ id: 'someone-else', roles: ['passenger'] });
    const inject = vi.fn().mockResolvedValue(response(order()));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);
    expect(await handle({ provider: 'telegram', externalUserId: '42', chatId: 'chat', data: `r:cancel-ok:${orderId}` }))
      .toEqual({ text: 'Этот заказ вам недоступен.', alert: true });
    expect(inject).toHaveBeenCalledOnce();
  });

  it('refreshes existing buttons instead of sending another card after rating', async () => {
    const completed = order({ status: 'completed', ratings: {} });
    const rated = order({ status: 'completed', ratings: { byPassenger: 5 } });
    mocks.firstRow.mockResolvedValueOnce({ user_id: 'passenger-user', chat_id: 'tg-chat' });
    mocks.findUserWithRoles.mockResolvedValue({
      id: 'passenger-user',
      roles: ['passenger'],
      blockedAt: undefined,
    });
    const inject = vi.fn()
      .mockResolvedValueOnce(response(completed))
      .mockResolvedValueOnce(response(rated));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);

    const result = await handle({
      provider: 'telegram',
      externalUserId: '42',
      chatId: 'tg-chat',
      sourceMessageId: '101',
      data: `r:rate-5:${orderId}`,
    });

    expect(result.text).toContain('Оценка сохранена');
    expect(mocks.notifyMessengerAccount).not.toHaveBeenCalled();
    expect(mocks.refreshMessengerAccountOrderMessages).toHaveBeenCalledWith(
      'telegram',
      '42',
      expect.objectContaining({
        orderId,
        audience: 'passenger',
        buttons: [[expect.objectContaining({ label: '🏁 Поездка завершена' })]],
      }),
      '101',
    );
  });

  it('replaces a stale cancel button when the ride is already completed', async () => {
    mocks.firstRow.mockResolvedValueOnce({ user_id: 'passenger-user', chat_id: 'tg-chat' });
    mocks.findUserWithRoles.mockResolvedValue({
      id: 'passenger-user',
      roles: ['passenger'],
      blockedAt: undefined,
    });
    const inject = vi.fn().mockResolvedValue(response(order({ status: 'completed' })));
    const handle = createMessengerOrderActionHandler({ inject } as unknown as FastifyInstance);

    const result = await handle({
      provider: 'telegram',
      externalUserId: '42',
      chatId: 'tg-chat',
      sourceMessageId: '55',
      data: `r:cancel:${orderId}`,
    });

    expect(result).toEqual({ text: 'Поездка уже завершена.', alert: true });
    expect(mocks.notifyMessengerAccount).not.toHaveBeenCalled();
    expect(mocks.refreshMessengerAccountOrderMessages).toHaveBeenCalledWith(
      'telegram',
      '42',
      expect.objectContaining({ orderId, audience: 'passenger' }),
      '55',
    );
  });
});
