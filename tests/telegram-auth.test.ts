import { describe, expect, it } from 'vitest';

import { extractOwnTelegramPhone, telegramStartPayload } from '../server/telegram-bot';

describe('Telegram phone confirmation', () => {
  it('extracts the one-time payload from a private bot start command', () => {
    expect(telegramStartPayload('/start abc_DEF-123')).toBe('abc_DEF-123');
    expect(telegramStartPayload('/start@taxigr_bot abc_DEF-123')).toBe('abc_DEF-123');
    expect(telegramStartPayload('/start')).toBeNull();
    expect(telegramStartPayload('/start payload with spaces')).toBeNull();
  });

  it('accepts only the sender own Telegram contact', () => {
    expect(
      extractOwnTelegramPhone({ phone_number: '+7 (912) 345-67-89', user_id: 42 }, '42'),
    ).toBe('+79123456789');
    expect(
      extractOwnTelegramPhone({ phone_number: '+7 (912) 345-67-89', user_id: 43 }, '42'),
    ).toBeNull();
    expect(extractOwnTelegramPhone({ phone_number: '+7 (912) 345-67-89' }, '42')).toBeNull();
  });
});
