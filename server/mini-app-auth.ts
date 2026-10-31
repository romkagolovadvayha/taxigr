import { createHmac, timingSafeEqual } from 'node:crypto';

import { normalizeRussianPhone } from './phone-verification';

export type MiniAppProvider = 'max' | 'telegram';
export type MiniAppIdentity = {
  provider: MiniAppProvider;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  chatId: string;
  canMessage: boolean;
};

export function miniAppAuthError(message = 'Закройте и заново откройте мини-приложение.'): Error {
  return Object.assign(new Error(message), { statusCode: 401, code: 'MINI_APP_UNAUTHORIZED' });
}

function digestMatches(digest: Buffer, value: string): boolean {
  return ['hex', 'base64', 'base64url'].some(encoding => {
    const expected = Buffer.from(digest.toString(encoding as BufferEncoding));
    const received = Buffer.from(value);
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}

function fresh(timestamp: number, now: number, maxAge: number): boolean {
  return Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now + 60 && now - timestamp <= maxAge;
}

function identifier(value: unknown): string | null {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  return (typeof value === 'number' || typeof value === 'string') && /^[1-9]\d{0,19}$/u.test(String(value)) ? String(value) : null;
}

const clean = (value: unknown, length: number) => typeof value === 'string' ? value.trim().slice(0, length) || null : null;

// Both platforms sign the original decoded values, including the serialized
// user object. Never rebuild that JSON or trust initDataUnsafe on the server.
export function verifyMiniAppLaunch(input: {
  provider: MiniAppProvider; initData: string; botToken: string; nowSeconds?: number;
}): MiniAppIdentity {
  if (!input.botToken || !input.initData || input.initData.length > 16384) throw miniAppAuthError();
  const params = new URLSearchParams(input.initData);
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw miniAppAuthError();
  const hash = params.get('hash');
  if (!hash || !/^[a-f\d]{64}$/iu.test(hash)) throw miniAppAuthError();
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(input.botToken).digest();
  if (!digestMatches(createHmac('sha256', secret).update(check).digest(), hash.toLowerCase())) throw miniAppAuthError();
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!fresh(Number(params.get('auth_date')), now, 3600)) throw miniAppAuthError();
  let user: Record<string, unknown>;
  let chat: Record<string, unknown> | null;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
    chat = JSON.parse(params.get('chat') ?? 'null');
  } catch { throw miniAppAuthError(); }
  const userId = user && typeof user === 'object' && !Array.isArray(user) && user.is_bot !== true ? identifier(user.id) : null;
  if (!userId) throw miniAppAuthError();
  const maxDialog = input.provider === 'max' && chat?.type === 'DIALOG' && identifier(chat.id);
  return {
    provider: input.provider, userId,
    firstName: clean(user.first_name, 80), lastName: clean(user.last_name, 80), username: clean(user.username, 64),
    chatId: maxDialog || userId,
    canMessage: input.provider === 'telegram' ? user.allows_write_to_pm === true : Boolean(maxDialog),
  };
}

export type MaxMiniAppContact = { phone: string; authDate: string; hash: string };

export function verifyMaxMiniAppContact(input: MaxMiniAppContact & {
  userId: string; botToken: string; nowSeconds?: number;
}): string {
  const timestamp = /^\d{10,13}$/u.test(input.authDate) ? Number(input.authDate) : NaN;
  const seconds = timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp;
  if (!fresh(seconds, input.nowSeconds ?? Math.floor(Date.now() / 1000), 300) ||
      !/^\+?\d{10,15}$/u.test(input.phone) || !identifier(input.userId) || !input.botToken) throw miniAppAuthError('Не удалось проверить номер MAX. Поделитесь им ещё раз.');
  // MAX Bridge specifies camelCase field names and a phone without '+' in
  // authDate=<value>\nphone=<value>\nuserId=<value>, signed with the bot token.
  const check = `authDate=${input.authDate}\nphone=${input.phone.replace(/^\+/u, '')}\nuserId=${input.userId}`;
  if (!digestMatches(createHmac('sha256', input.botToken).update(check).digest(), input.hash)) throw miniAppAuthError('MAX не подтвердил номер телефона.');
  const phone = normalizeRussianPhone(input.phone);
  if (!phone) throw Object.assign(new Error('Для заказа нужен российский номер телефона.'), { statusCode: 400, code: 'PHONE_INVALID' });
  return phone;
}
