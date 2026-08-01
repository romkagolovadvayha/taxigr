export type MessengerProvider = 'max' | 'telegram';

export type MessengerIdentityInput = {
  provider: MessengerProvider;
  externalUserId: string;
  chatId: string;
  username?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

function clean(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim().replace(/\s+/gu, ' ').slice(0, maxLength) ?? '';
  return normalized || null;
}

export function normalizeMessengerIdentity(input: MessengerIdentityInput) {
  const firstName = clean(input.firstName, 80);
  const lastName = clean(input.lastName, 80);
  const displayName = clean(input.displayName, 160) ??
    clean([firstName, lastName].filter(Boolean).join(' '), 160);

  return {
    provider: input.provider,
    externalUserId: clean(input.externalUserId, 64)!,
    chatId: clean(input.chatId, 64)!,
    username: clean(input.username?.replace(/^@+/u, ''), 64),
    displayName,
    firstName,
    lastName,
    profileName: displayName,
  };
}
