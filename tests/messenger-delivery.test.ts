import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendMaxLocation: vi.fn(),
  sendMaxMessage: vi.fn(),
  sendTelegramMessage: vi.fn(),
  sendTelegramVenue: vi.fn(),
}));

vi.mock('../server/config', () => ({
  config: {
    MAX_BOT_TOKEN: 'max-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    PUBLIC_URL: 'https://taxi.example',
  },
}));

vi.mock('../server/db', () => ({
  db: { query: mocks.query },
  firstRow: vi.fn(),
}));

vi.mock('../server/max-bot', () => ({
  sendMaxLocation: mocks.sendMaxLocation,
  sendMaxMessage: mocks.sendMaxMessage,
}));

vi.mock('../server/telegram-bot', () => ({
  sendTelegramMessage: mocks.sendTelegramMessage,
  sendTelegramVenue: mocks.sendTelegramVenue,
}));

import { notifyUsersInMessengers } from '../server/messenger-notifications';

const notification = {
  icon: '🚕',
  title: 'Заказ',
  body: 'ул. Юбилейная, 5 → ул. Ачинцева, 2а',
  buttons: [
    [{ type: 'callback' as const, label: '✅ Принять', data: 'r:a:id', intent: 'positive' as const }],
    [{ type: 'callback' as const, label: '✖️ Отменить', data: 'r:c:id', intent: 'negative' as const }],
  ],
  locations: [{
    title: 'Место подачи',
    address: 'ул. Юбилейная, 5',
    latitude: 56.05,
    longitude: 52.99,
  }],
};

describe('messenger platform delivery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps semantic actions and location to native MAX attachments', async () => {
    mocks.query.mockResolvedValueOnce([[
      { provider: 'max', external_user_id: 'max-user', chat_id: 'max-chat' },
    ]]);

    await notifyUsersInMessengers(['user-1'], notification);

    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      'max-user',
      expect.objectContaining({
        attachments: [{
          type: 'inline_keyboard',
          payload: {
            buttons: [
              [expect.objectContaining({ type: 'callback', intent: 'positive' })],
              [expect.objectContaining({ type: 'callback', intent: 'negative' })],
            ],
          },
        }],
      }),
    );
    expect(mocks.sendMaxLocation).toHaveBeenCalledWith(
      'max-user',
      notification.locations[0],
    );
  });

  it('maps semantic actions and coordinates to native Telegram controls', async () => {
    mocks.query.mockResolvedValueOnce([[
      { provider: 'telegram', external_user_id: 'tg-user', chat_id: 'tg-chat' },
    ]]);

    await notifyUsersInMessengers(['user-1'], notification);

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      'tg-chat',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [expect.objectContaining({ callback_data: 'r:a:id', style: 'success' })],
            [expect.objectContaining({ callback_data: 'r:c:id', style: 'danger' })],
          ],
        },
      }),
    );
    expect(mocks.sendTelegramVenue).toHaveBeenCalledWith(
      'tg-chat',
      notification.locations[0],
    );
  });
});
