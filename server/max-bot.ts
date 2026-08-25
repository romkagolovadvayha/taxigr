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
  success?: boolean;
};

async function callMaxApi<T = unknown>(
  path: string,
  body: Record<string, unknown> | undefined,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://platform-api2.max.ru/${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: config.MAX_BOT_TOKEN,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => ({}))) as MaxApiError & T;
    if (!response.ok || result.success === false) {
      throw new Error(result.message ?? result.code ?? `MAX Bot API HTTP ${response.status}`);
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMaxDialogProfilePhotoUrl(
  chatId: string,
  userId: string,
): Promise<string | null> {
  const chat = await callMaxApi<{
    type?: unknown;
    dialog_with_user?: {
      user_id?: unknown;
      avatar_url?: unknown;
      full_avatar_url?: unknown;
    } | null;
  }>(`chats/${encodeURIComponent(chatId)}`, undefined, 'GET');
  const profile = chat.type === 'dialog' ? chat.dialog_with_user : null;
  if (!profile || String(profile.user_id ?? '') !== userId) return null;
  if (typeof profile.full_avatar_url === 'string') return profile.full_avatar_url;
  return typeof profile.avatar_url === 'string' ? profile.avatar_url : null;
}

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

let maxSendQueue = Promise.resolve();
let nextMaxSendAt = 0;
const nextMaxSendByUser = new Map<string, number>();

async function waitForMaxSendSlot(userId: string): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(
    0,
    nextMaxSendAt - now,
    (nextMaxSendByUser.get(userId) ?? 0) - now,
  );
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const sentAt = Date.now();
  nextMaxSendAt = sentAt + 40;
  nextMaxSendByUser.set(userId, sentAt + 500);
}

export async function sendMaxMessage(
  userId: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  const previous = maxSendQueue;
  let releaseQueue: () => void = () => undefined;
  maxSendQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  await waitForMaxSendSlot(userId);
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
    const result = await response.json().catch(() => ({})) as {
      body?: { mid?: unknown };
    };
    return typeof result.body?.mid === 'string' ? result.body.mid : null;
  } finally {
    clearTimeout(timeout);
    releaseQueue();
  }
}

export async function editMaxMessage(
  userId: string,
  messageId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const previous = maxSendQueue;
  let releaseQueue: () => void = () => undefined;
  maxSendQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  await waitForMaxSendSlot(userId);
  try {
    await callMaxApi(`messages?message_id=${encodeURIComponent(messageId)}`, body, 'PUT');
  } finally {
    releaseQueue();
  }
}

export async function deleteMaxMessage(userId: string, messageId: string): Promise<void> {
  const previous = maxSendQueue;
  let releaseQueue: () => void = () => undefined;
  maxSendQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  await waitForMaxSendSlot(userId);
  try {
    await callMaxApi(
      `messages?message_id=${encodeURIComponent(messageId)}`,
      undefined,
      'DELETE',
    );
  } finally {
    releaseQueue();
  }
}

export async function sendMaxLocation(
  userId: string,
  location: {
    latitude: number;
    longitude: number;
    title: string;
    address: string;
  },
): Promise<void> {
  await sendMaxMessage(userId, {
    text: `📍 ${location.title}\n${location.address}`,
    attachments: [{
      type: 'location',
      latitude: location.latitude,
      longitude: location.longitude,
    }],
  });
}

export async function answerMaxCallback(
  callbackId: string,
  notification: string,
): Promise<void> {
  await callMaxApi(`answers?callback_id=${encodeURIComponent(callbackId)}`, {
    notification: notification.slice(0, 200),
  });
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
