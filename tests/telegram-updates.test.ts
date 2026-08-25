import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processTelegramUpdate, telegramUpdateSchema } from '../server/telegram-updates';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  firstRow: vi.fn(),
  answerTelegramCallback: vi.fn(),
  extractOwnTelegramPhone: vi.fn(),
  requestTelegramContact: vi.fn(),
  sendTelegramConfirmation: vi.fn(),
  telegramStartPayload: vi.fn(),
}));

vi.mock('../server/db', () => ({
  db: { execute: mocks.execute },
  firstRow: mocks.firstRow,
}));

vi.mock('../server/telegram-bot', () => ({
  answerTelegramCallback: mocks.answerTelegramCallback,
  extractOwnTelegramPhone: mocks.extractOwnTelegramPhone,
  requestTelegramContact: mocks.requestTelegramContact,
  sendTelegramConfirmation: mocks.sendTelegramConfirmation,
  telegramStartPayload: mocks.telegramStartPayload,
}));

describe('Telegram update processing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links a valid /start payload and requests the contact', async () => {
    mocks.telegramStartPayload.mockReturnValue('payload-token');
    mocks.firstRow.mockResolvedValue({ id: 'challenge-id' });

    const update = telegramUpdateSchema.parse({
      update_id: 1,
      message: {
        text: '/start payload-token',
        from: { id: 42, username: 'passenger' },
        chat: { id: 42, type: 'private' },
      },
    });
    await processTelegramUpdate(update);

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.requestTelegramContact).toHaveBeenCalledWith('42');
  });

  it('records a matching shared phone and confirms it', async () => {
    mocks.telegramStartPayload.mockReturnValue(null);
    mocks.extractOwnTelegramPhone.mockReturnValue('+79990000000');
    mocks.firstRow.mockResolvedValue({ id: 'challenge-id', expected_phone: '+79990000000' });

    const update = telegramUpdateSchema.parse({
      update_id: 2,
      message: {
        from: { id: 42 },
        chat: { id: 42, type: 'private' },
        contact: { phone_number: '+7 999 000-00-00', user_id: 42 },
      },
    });
    await processTelegramUpdate(update);

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.sendTelegramConfirmation).toHaveBeenCalledWith('42', true);
  });

  it('routes a private callback to the order action handler and answers it', async () => {
    const onAction = vi.fn().mockResolvedValue({ text: 'Заказ принят ✅' });
    const update = telegramUpdateSchema.parse({
      update_id: 3,
      callback_query: {
        id: 'callback-1',
        data: 'r:a:123e4567-e89b-12d3-a456-426614174000',
        from: { id: 42 },
        message: { chat: { id: 42, type: 'private' } },
      },
    });

    await processTelegramUpdate(update, onAction);

    expect(onAction).toHaveBeenCalledWith({
      provider: 'telegram',
      externalUserId: '42',
      chatId: '42',
      data: 'r:a:123e4567-e89b-12d3-a456-426614174000',
    });
    expect(mocks.answerTelegramCallback).toHaveBeenCalledWith(
      'callback-1',
      'Заказ принят ✅',
      undefined,
    );
  });

  it('always closes the callback spinner when an action fails', async () => {
    const onAction = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const update = telegramUpdateSchema.parse({
      callback_query: {
        id: 'callback-2',
        data: 'r:refresh:123e4567-e89b-12d3-a456-426614174000',
        from: { id: 42 },
        message: { chat: { id: 42, type: 'private' } },
      },
    });

    await processTelegramUpdate(update, onAction);

    expect(mocks.answerTelegramCallback).toHaveBeenCalledWith(
      'callback-2',
      expect.stringContaining('Не удалось'),
      true,
    );
  });
});
