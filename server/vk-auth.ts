import { randomInt } from 'node:crypto';

import { config } from './config';
import { normalizeRussianPhone } from './phone-verification';

// Keep server-generated authorization links compatible with the current
// official @vkid/sdk URL contract.
const VK_ID_SDK_VERSION = '2.6.1';
const VK_ID_SESSION_ALPHABET = 'qazwsxedcrfvtgbyhnujmikol';

function vkIdSessionId(): string {
  return Array.from(
    { length: 6 },
    () => VK_ID_SESSION_ALPHABET[randomInt(VK_ID_SESSION_ALPHABET.length)],
  ).join('');
}

type VkTokenResponse = {
  access_token?: unknown;
  user_id?: unknown;
  state?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type VkUserInfoResponse = {
  user?: {
    user_id?: unknown;
    phone?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  };
  error?: unknown;
  error_description?: unknown;
};

export type VkIdentity = {
  userId: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
};

function vkError(payload: { error?: unknown; error_description?: unknown }, fallback: string): Error {
  const description = typeof payload.error_description === 'string'
    ? payload.error_description
    : typeof payload.error === 'string'
      ? payload.error
      : fallback;
  return new Error(description);
}

export function vkAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://id.vk.ru/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.VK_APP_ID);
  url.searchParams.set('app_id', config.VK_APP_ID);
  url.searchParams.set('redirect_uri', config.VK_REDIRECT_URI);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 's256');
  url.searchParams.set('scope', 'phone');
  url.searchParams.set('prompt', '');
  url.searchParams.set('stats_info', Buffer.from(JSON.stringify({
    flow_source: 'from_custom_auth',
    session_id: vkIdSessionId(),
  }), 'utf8').toString('base64'));
  url.searchParams.set('sdk_type', 'vkid');
  url.searchParams.set('v', VK_ID_SDK_VERSION);
  return url.toString();
}

export async function exchangeVkAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  state: string;
}): Promise<VkIdentity> {
  const tokenUrl = new URL('https://id.vk.ru/oauth2/auth');
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('redirect_uri', config.VK_REDIRECT_URI);
  tokenUrl.searchParams.set('client_id', config.VK_APP_ID);
  tokenUrl.searchParams.set('code_verifier', input.codeVerifier);
  tokenUrl.searchParams.set('device_id', input.deviceId);
  tokenUrl.searchParams.set('state', input.state);

  const tokenController = new AbortController();
  const tokenTimeout = setTimeout(() => tokenController.abort(), 10_000);
  let token: VkTokenResponse;
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: input.code }),
      signal: tokenController.signal,
    });
    token = await response.json().catch(() => ({})) as VkTokenResponse;
    if (!response.ok || typeof token.access_token !== 'string') {
      throw vkError(token, `VK ID HTTP ${response.status}`);
    }
    if (typeof token.state === 'string' && token.state !== input.state) {
      throw new Error('VK ID returned an unexpected OAuth state');
    }
  } finally {
    clearTimeout(tokenTimeout);
  }

  const infoUrl = new URL('https://id.vk.ru/oauth2/user_info');
  infoUrl.searchParams.set('client_id', config.VK_APP_ID);
  const infoController = new AbortController();
  const infoTimeout = setTimeout(() => infoController.abort(), 10_000);
  try {
    const response = await fetch(infoUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: token.access_token }),
      signal: infoController.signal,
    });
    const result = await response.json().catch(() => ({})) as VkUserInfoResponse;
    const rawUserId = result.user?.user_id ?? token.user_id;
    if (!response.ok || (typeof rawUserId !== 'string' && typeof rawUserId !== 'number')) {
      throw vkError(result, `VK ID user_info HTTP ${response.status}`);
    }
    return {
      userId: String(rawUserId),
      phone: typeof result.user?.phone === 'string'
        ? normalizeRussianPhone(result.user.phone)
        : null,
      firstName: typeof result.user?.first_name === 'string' ? result.user.first_name : null,
      lastName: typeof result.user?.last_name === 'string' ? result.user.last_name : null,
    };
  } finally {
    clearTimeout(infoTimeout);
  }
}

export function vkCallbackHtml(success: boolean): string {
  const title = success ? 'Вход подтверждён' : 'Не удалось подтвердить вход';
  const message = success
    ? 'Номер подтверждён. Вернитесь в приложение — вход завершится автоматически.'
    : 'Закройте это окно и попробуйте войти через VK ещё раз.';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f4f4f2;color:#181818;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 48px));box-sizing:border-box;margin:24px;padding:32px;border:1px solid #ddd;border-radius:28px;background:white;text-align:center}h1{margin:0 0 16px}p{line-height:1.5}.mark{width:64px;height:64px;border-radius:18px;background:#0077ff;color:white;display:grid;place-items:center;margin:0 auto 20px;font-size:30px;font-weight:800}</style></head><body><main class="card"><div class="mark">VK</div><h1>${title}</h1><p>${message}</p></main></body></html>`;
}
