import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type VerifiedVkMiniAppLaunch = {
  appId: string;
  userId: string;
  timestamp: number;
};

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function invalidLaunch(message: string): Error {
  return Object.assign(new Error(message), {
    statusCode: 401,
    code: 'VK_MINI_APP_UNAUTHORIZED',
  });
}

export function verifyVkMiniAppLaunchParams(input: {
  launchParams: string;
  appId: string;
  secret: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}): VerifiedVkMiniAppLaunch {
  const raw = input.launchParams.startsWith('?')
    ? input.launchParams.slice(1)
    : input.launchParams;
  if (!raw || raw.length > 8_192) throw invalidLaunch('Параметры запуска VK отсутствуют');

  const parsed = new URLSearchParams(raw);
  const signValues = parsed.getAll('sign');
  if (signValues.length !== 1 || !signValues[0]) {
    throw invalidLaunch('Подпись запуска VK отсутствует');
  }

  const signedParams: Array<{ key: string; value: string }> = [];
  for (const [key, value] of parsed.entries()) {
    if (!key.startsWith('vk_')) continue;
    if (parsed.getAll(key).length !== 1) {
      throw invalidLaunch('Параметры запуска VK неоднозначны');
    }
    signedParams.push({ key, value });
  }
  if (!signedParams.length) throw invalidLaunch('Параметры запуска VK не найдены');

  const signedQuery = signedParams
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ key, value }) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const expectedSign = createHmac('sha256', input.secret)
    .update(signedQuery)
    .digest('base64url');
  if (!constantTimeEqual(expectedSign, signValues[0])) {
    throw invalidLaunch('Подпись запуска VK недействительна');
  }

  const appId = parsed.get('vk_app_id') ?? '';
  const userId = parsed.get('vk_user_id') ?? '';
  const timestamp = Number(parsed.get('vk_ts'));
  if (appId !== input.appId || !/^\d+$/u.test(userId)) {
    throw invalidLaunch('Приложение или пользователь VK не совпадает');
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw invalidLaunch('Время запуска VK недействительно');
  }
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const maxAgeSeconds = input.maxAgeSeconds ?? 900;
  if (timestamp > nowSeconds + 60 || nowSeconds - timestamp > maxAgeSeconds) {
    throw invalidLaunch('Сессия VK устарела. Откройте мини-приложение ещё раз');
  }

  return { appId, userId, timestamp };
}

export function verifyVkMiniAppPhone(input: {
  appId: string;
  secret: string;
  userId: string;
  phoneNumber: string;
  sign: string;
}): boolean {
  if (!input.phoneNumber || !input.sign || input.sign.length > 256) return false;
  const digest = createHash('sha256')
    .update(`${input.appId}${input.secret}${input.userId}phone_number${input.phoneNumber}`)
    .digest();
  const expectedSigns = [
    digest.toString('hex'),
    digest.toString('hex').toUpperCase(),
    digest.toString('base64'),
    digest.toString('base64').replace(/=+$/u, ''),
    digest.toString('base64url'),
  ];
  return expectedSigns.some((expected) => constantTimeEqual(expected, input.sign));
}
