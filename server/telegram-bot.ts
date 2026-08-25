import { fetch as undiciFetch, ProxyAgent } from 'undici';

import { config } from './config';
import { normalizeRussianPhone } from './phone-verification';

type TelegramApiResponse<T = unknown> = {
  ok?: boolean;
  description?: string;
  result?: T;
};

type TelegramContact = {
  phone_number?: unknown;
  user_id?: unknown;
};

const telegramProxyAgent = config.TELEGRAM_PROXY_URL
  ? new ProxyAgent(config.TELEGRAM_PROXY_URL)
  : undefined;

async function callTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await undiciFetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        dispatcher: telegramProxyAgent,
      },
    );
    const result = (await response.json().catch(() => ({}))) as TelegramApiResponse<T>;
    if (!response.ok || result.ok !== true) {
      throw new Error(result.description ?? `Telegram Bot API HTTP ${response.status}`);
    }
    return result.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramMessage(
  chatId: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  const message = await callTelegramApi<{ message_id?: number | string }>(
    'sendMessage',
    { chat_id: chatId, ...body },
  );
  return message.message_id == null ? null : String(message.message_id);
}

export async function editTelegramMessage(
  chatId: string,
  messageId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await callTelegramApi('editMessageText', {
    chat_id: chatId,
    message_id: Number(messageId),
    ...body,
  });
}

export async function deleteTelegramMessage(chatId: string, messageId: string): Promise<void> {
  await callTelegramApi('deleteMessage', {
    chat_id: chatId,
    message_id: Number(messageId),
  });
}

export async function getTelegramProfilePhotoUrl(userId: string): Promise<string | null> {
  const result = await callTelegramApi<{
    total_count?: number;
    photos?: { file_id?: string; width?: number; height?: number }[][];
  }>('getUserProfilePhotos', { user_id: userId, offset: 0, limit: 1 });
  const sizes = result.photos?.[0] ?? [];
  const largest = [...sizes]
    .filter((photo): photo is { file_id: string; width?: number; height?: number } =>
      typeof photo.file_id === 'string',
    )
    .sort((left, right) =>
      (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0),
    )[0];
  if (!largest) return null;
  const file = await callTelegramApi<{ file_path?: unknown }>('getFile', {
    file_id: largest.file_id,
  });
  if (typeof file.file_path !== 'string' || !file.file_path) return null;
  return `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}

export async function sendTelegramVenue(
  chatId: string,
  location: {
    latitude: number;
    longitude: number;
    title: string;
    address: string;
  },
): Promise<void> {
  await callTelegramApi('sendVenue', {
    chat_id: chatId,
    latitude: location.latitude,
    longitude: location.longitude,
    title: location.title.slice(0, 256),
    address: location.address.slice(0, 256),
  });
}

export async function answerTelegramCallback(
  callbackQueryId: string,
  text: string,
  showAlert = false,
): Promise<void> {
  await callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text.slice(0, 200),
    show_alert: showAlert,
  });
}

export function telegramStartPayload(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  return text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{1,64})\s*$/u)?.[1] ?? null;
}

export function extractOwnTelegramPhone(
  contact: TelegramContact,
  senderId: string,
): string | null {
  if (contact.user_id == null || String(contact.user_id) !== senderId) return null;
  return typeof contact.phone_number === 'string'
    ? normalizeRussianPhone(contact.phone_number)
    : null;
}

export async function requestTelegramContact(chatId: string): Promise<void> {
  await sendTelegramMessage(chatId, {
    text: 'Чтобы подтвердить номер для входа в Такси Грахово, нажмите кнопку ниже и поделитесь номером телефона, привязанным к вашему аккаунту Telegram.',
    reply_markup: {
      keyboard: [[{ text: 'Поделиться номером', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'Нажмите «Поделиться номером»',
    },
  });
}

export async function sendTelegramConfirmation(
  chatId: string,
  success: boolean,
): Promise<void> {
  await sendTelegramMessage(chatId, {
    text: success
      ? 'Номер подтверждён. Вернитесь в приложение Такси Грахово — вход завершится автоматически.'
      : 'Номер Telegram не совпадает с номером, указанным в приложении. Вернитесь в приложение и проверьте номер.',
    reply_markup: { remove_keyboard: true },
  });
}
