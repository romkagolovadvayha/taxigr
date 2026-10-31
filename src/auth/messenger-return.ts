import { readPendingMessengerLogin, type MessengerAuthExchange, type MessengerAuthProvider } from '../storage/messenger-login-storage';

export function parseMessengerReturn(provider: unknown, challenge: unknown) {
  if (!['max', 'telegram', 'vk'].includes(String(provider)) || typeof provider !== 'string' ||
    typeof challenge !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(challenge)) return null;
  return { provider: provider as MessengerAuthProvider, challengeId: challenge };
}

export function nativeMessengerReturnUrl(input: { provider: MessengerAuthProvider; challengeId: string }): string {
  return `taxigrahovo://auth-return?provider=${input.provider}&challenge=${encodeURIComponent(input.challengeId)}`;
}

export async function resumeMessengerLogin(
  input: { provider: MessengerAuthProvider; challengeId: string },
  verify: (challenge: MessengerAuthExchange) => Promise<'pending' | 'expired' | 'failed' | 'verified'>,
): Promise<'missing' | 'pending' | 'expired' | 'failed' | 'verified'> {
  const pending = await readPendingMessengerLogin();
  if (!pending || pending.provider !== input.provider || pending.challenge.challengeId !== input.challengeId) return 'missing';
  return verify(pending.challenge);
}
