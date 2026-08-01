import { fetch as undiciFetch, ProxyAgent } from 'undici';

import { config } from './config';
import { normalizeRussianPhone } from './phone-verification';

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
};

type TelegramContact = {
  phone_number?: unknown;
  user_id?: unknown;
};

const telegramProxyAgent = config.TELEGRAM_PROXY_URL
  ? new ProxyAgent(config.TELEGRAM_PROXY_URL)
  : undefined;

export async function sendTelegramMessage(
  chatId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await undiciFetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chat_id: chatId, ...body }),
        signal: controller.signal,
        dispatcher: telegramProxyAgent,
      },
    );
    const result = (await response.json().catch(() => ({}))) as TelegramApiResponse;
    if (!response.ok || result.ok !== true) {
      throw new Error(result.description ?? `Telegram Bot API HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
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
