import { config } from './config';

export function legacyMessengerReturnUrl(): string {
  return new URL('/return-to-taxi.html', config.PUBLIC_URL).href;
}

// This link carries navigation context only. The exchange secret stays on the
// device that started login, never in bot messages, browser history or referrers.
export function messengerAuthReturnUrl(
  provider: 'max' | 'telegram' | 'vk',
  challengeId: string,
  platform: 'android' | 'ios' | 'web',
): string;
export function messengerAuthReturnUrl(
  provider: 'max' | 'telegram' | 'vk',
  challengeId: string,
  platform: string | null | undefined,
): string | undefined;
export function messengerAuthReturnUrl(
  provider: 'max' | 'telegram' | 'vk',
  challengeId: string,
  platform: string | null | undefined,
): string | undefined {
  // Released apps keep the exchange secret only in memory and do not have the
  // return route. Keep their original polling/manual-return login flow intact.
  if (platform !== 'android' && platform !== 'ios' && platform !== 'web') return undefined;
  const url = new URL('/auth-return', config.PUBLIC_URL);
  url.searchParams.set('provider', provider);
  url.searchParams.set('challenge', challengeId);
  url.searchParams.set('target', platform === 'android' || platform === 'ios' ? platform : 'web');
  return url.toString();
}
