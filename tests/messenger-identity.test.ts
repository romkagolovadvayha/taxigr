import { describe, expect, it } from 'vitest';

import { normalizeMessengerIdentity } from '../server/messenger-identity';

describe('messenger identity', () => {
  it('builds a Telegram profile name and normalizes the username', () => {
    expect(normalizeMessengerIdentity({
      provider: 'telegram',
      externalUserId: '123',
      chatId: '123',
      username: '@taxi_user',
      firstName: '  Иван ',
      lastName: ' Иванов  ',
    })).toMatchObject({
      username: 'taxi_user',
      displayName: 'Иван Иванов',
      profileName: 'Иван Иванов',
    });
  });

  it('prefers the MAX display name', () => {
    expect(normalizeMessengerIdentity({
      provider: 'max',
      externalUserId: '456',
      chatId: '789',
      displayName: '  Анна   Смирнова ',
    }).profileName).toBe('Анна Смирнова');
  });
});
