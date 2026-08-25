import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../server/config', () => ({
  config: { EXPO_ACCESS_TOKEN: 'expo-access-token' },
}));

vi.mock('../server/db', () => ({
  db: { query: mocks.query, execute: mocks.execute },
}));

import { notifyUsers } from '../server/push';

describe('Expo push delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('checks Expo tickets and removes a token rejected as unregistered', async () => {
    mocks.query.mockResolvedValueOnce([[
      { token: 'ExponentPushToken[stale]' },
      { token: 'ExponentPushToken[active]' },
    ]]);
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
});
