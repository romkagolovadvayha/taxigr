import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../server/config', () => ({
  config: {
    EXPO_ACCESS_TOKEN: 'expo-access-token',
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
    VAPID_SUBJECT: 'mailto:support@taxigr.ru',
  },
}));

vi.mock('../server/db', () => ({
  db: { query: mocks.query, execute: mocks.execute },
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
}));

import { notifyUsers } from '../server/push';

describe('Expo push delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('checks Expo tickets and removes a token rejected as unregistered', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        { token: 'ExponentPushToken[stale]' },
        { token: 'ExponentPushToken[active]' },
      ]])
      .mockResolvedValueOnce([[]]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            status: 'error',
            message: 'Device is not registered',
            details: { error: 'DeviceNotRegistered' },
          },
          { status: 'ok', id: 'ticket-2' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await notifyUsers(['user-1'], {
      title: 'Найден водитель',
      body: 'Номер авто О564НО18 едет к вам',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer expo-access-token',
        }),
      }),
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      'DELETE FROM push_tokens WHERE token = ?',
      ['ExponentPushToken[stale]'],
    );
  });

  it('delivers browser notifications to the current user subscription', async () => {
    mocks.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { endpoint: 'https://push.example.test/subscription', p256dh: 'key', auth_secret: 'secret' },
      ]]);
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });

    await notifyUsers(['user-1'], {
      title: 'Новый заказ',
      body: 'Появился новый заказ',
      data: { role: 'driver', orderId: '11111111-1111-1111-1111-111111111111' },
    });

    expect(mocks.setVapidDetails).toHaveBeenCalledWith(
      'mailto:support@taxigr.ru',
      'public-key',
      'private-key',
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example.test/subscription' }),
      expect.stringContaining('/driver/trips/11111111-1111-1111-1111-111111111111'),
      expect.objectContaining({ urgency: 'high' }),
    );
  });

  it('keeps chat message text and the chat deep link in browser push payloads', async () => {
    mocks.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { endpoint: 'https://push.example.test/chat', p256dh: 'key', auth_secret: 'secret' },
      ]]);
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });

    await notifyUsers(['user-1'], {
      title: 'Сообщение от Иван',
      body: 'Я уже подъехал',
      data: {
        chat: 'true',
        role: 'passenger',
        orderId: '11111111-1111-1111-1111-111111111111',
      },
      channelId: 'ride-chat-v1',
    });

    const payload = JSON.parse(String(mocks.sendNotification.mock.calls[0]?.[1]));
    expect(payload).toMatchObject({
      title: 'Сообщение от Иван',
      body: 'Я уже подъехал',
      url: '/chat/11111111-1111-1111-1111-111111111111',
    });
  });
});
