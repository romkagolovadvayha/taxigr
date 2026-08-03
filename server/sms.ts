import { config } from './config';

const NOTIFICORE_BASE_URL = 'https://one-api.notificore.ru/api';
const REQUEST_TIMEOUT_MS = 10_000;
const NOTIFICORE_CODE_LIFETIME_SECONDS = 180;

type JsonRecord = Record<string, unknown>;

export type PhoneVerificationSession = {
  providerAuthenticationId: string | null;
  expiresInSeconds: number;
};

export type PhoneVerificationResult = 'verified' | 'invalid' | 'expired';

let cachedBearerToken: string | null = null;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function responseMessage(payload: unknown): string {
  const body = asRecord(payload);
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const firstError = asRecord(errors[0]);
  const structuredErrors = body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)
    ? Object.entries(body.errors as JsonRecord).flatMap(([field, value]) =>
        (Array.isArray(value) ? value : [value]).map((message) => `${field}: ${String(message)}`),
      )
    : [];
  return String(
    firstError.message ??
    structuredErrors[0] ??
    body.message ??
    body.error ??
    'Unknown Notificore error',
  );
}

async function fetchJson(url: string, init: RequestInit): Promise<{ response: Response; body: JsonRecord }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = asRecord(await response.json().catch(() => ({})));
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function getBearerToken(forceRefresh = false): Promise<string> {
  if (config.NOTIFICORE_BEARER_TOKEN) return config.NOTIFICORE_BEARER_TOKEN;
  if (cachedBearerToken && !forceRefresh) return cachedBearerToken;

  const { response, body } = await fetchJson(`${NOTIFICORE_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ api_key: config.NOTIFICORE_API_KEY }),
  });
  const data = asRecord(body.data);
  const bearer = body.bearer ?? data.bearer;
  if (!response.ok || typeof bearer !== 'string' || !bearer) {
    throw new Error(`Notificore authentication failed: ${responseMessage(body)}`);
  }

  cachedBearerToken = bearer;
  return bearer;
}

async function notificoreRequest(path: string, body: JsonRecord): Promise<{
  response: Response;
  body: JsonRecord;
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const bearer = await getBearerToken(attempt > 0);
    const result = await fetchJson(`${NOTIFICORE_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (result.response.status !== 401 || attempt > 0 || config.NOTIFICORE_BEARER_TOKEN) {
      return result;
    }
    cachedBearerToken = null;
  }
  throw new Error('Notificore authentication failed');
}

export async function sendPhoneVerificationCode(
  phone: string,
  _consoleCode: string,
  _ipAddress: string,
): Promise<PhoneVerificationSession> {
  if (config.SMS_PROVIDER === 'console') {
    return {
      providerAuthenticationId: null,
      expiresInSeconds: config.PHONE_CODE_TTL_MINUTES * 60,
    };
  }

  const { response, body } = await notificoreRequest('/2fa/authentications/otp', {
    channel: 'sms',
    recipient: phone.replace(/\D/gu, ''),
    ...(config.NOTIFICORE_ORIGINATOR ? { sender: config.NOTIFICORE_ORIGINATOR } : {}),
    template_id: Number(config.NOTIFICORE_TEMPLATE_ID),
    code_digits: 4,
    code_max_tries: 3,
    code_lifetime: NOTIFICORE_CODE_LIFETIME_SECONDS,
  });
  const data = asRecord(body.data);
  if (!response.ok || typeof data.id !== 'string' || !data.id) {
    throw new Error(`Notificore OTP creation failed: ${responseMessage(body)}`);
  }

  return {
    providerAuthenticationId: data.id,
    expiresInSeconds: NOTIFICORE_CODE_LIFETIME_SECONDS,
  };
}

export async function verifyPhoneVerificationCode(
  providerAuthenticationId: string,
  code: string,
): Promise<PhoneVerificationResult> {
  const { response, body } = await notificoreRequest(
    `/2fa/authentications/otp/${encodeURIComponent(providerAuthenticationId)}/verify`,
    { access_code: code },
  );
  const data = asRecord(body.data);
  if (response.ok && data.status === 'verified') return 'verified';

  const message = responseMessage(body).toLowerCase();
  if (message.includes('expired') || message.includes('not found')) return 'expired';
  if (
    message.includes('does not match') ||
    message.includes('attempts limit') ||
    message.includes('invalid code')
  ) {
    return 'invalid';
  }
  throw new Error(`Notificore OTP verification failed: ${responseMessage(body)}`);
}
