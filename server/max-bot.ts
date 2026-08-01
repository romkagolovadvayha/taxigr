import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from './config';
import { normalizeRussianPhone } from './phone-verification';

type MaxContactPayload = {
  vcf_info?: unknown;
  hash?: unknown;
};

type MaxApiError = {
  code?: string;
  message?: string;
};

export function normalizeMaxVcfInfo(value: string): string {
  return value.replace(/\\r\\n/gu, '\r\n');
}

export function maxContactHash(vcfInfo: string, accessToken: string): string {
  return createHmac('sha256', accessToken)
    .update(normalizeMaxVcfInfo(vcfInfo))
    .digest('hex');
}

function constantTimeTextMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyMaxContact(payload: MaxContactPayload, accessToken: string): boolean {
  if (typeof payload.vcf_info !== 'string' || typeof payload.hash !== 'string') return false;
  const normalized = normalizeMaxVcfInfo(payload.vcf_info);
  const binaryDigest = createHmac('sha256', accessToken).update(normalized).digest();
  const candidates = [
    binaryDigest.toString('hex'),
    binaryDigest.toString('base64'),
    binaryDigest.toString('base64url'),
  ];
  return candidates.some((candidate) => constantTimeTextMatch(candidate, payload.hash as string));
}

export function extractPhoneFromMaxVcf(vcfInfo: string): string | null {
  const normalized = normalizeMaxVcfInfo(vcfInfo);
  const rawPhone = normalized.match(/^TEL(?:;[^:]*)?:(.+)$/imu)?.[1]?.trim();
  return rawPhone ? normalizeRussianPhone(rawPhone) : null;
}

async function sendMaxMessage(userId: string, body: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(userId)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: config.MAX_BOT_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as MaxApiError;
      throw new Error(error.message ?? error.code ?? `MAX Bot API HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestMaxContact(userId: string): Promise<void> {
  await sendMaxMessage(userId, {
    text: 'Чтобы подтвердить номер для входа в Такси Грахово, поделитесь номером телефона, привязанным к вашему аккаунту MAX.',
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'request_contact', text: 'Поделиться номером' }]],
        },
      },
    ],
  });
}

export async function sendMaxConfirmation(userId: string, success: boolean): Promise<void> {
  await sendMaxMessage(userId, {
    text: success
      ? 'Номер подтверждён. Вернитесь в приложение Такси Грахово — вход завершится автоматически.'
      : 'Номер MAX не совпадает с номером, указанным в приложении. Вернитесь в приложение и проверьте номер.',
  });
}
