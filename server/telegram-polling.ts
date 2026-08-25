import type { FastifyBaseLogger } from 'fastify';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

import { config } from './config';
import {
  processTelegramUpdate,
  telegramUpdateSchema,
  type TelegramActionHandler,
} from './telegram-updates';

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
  result?: unknown;
};

const POLL_SECONDS = 25;
const RETRY_DELAY_MS = 3_000;

function safeError(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: String(error) };
}

export function startTelegramPolling(
  logger: FastifyBaseLogger,
  onAction?: TelegramActionHandler,
): () => Promise<void> {
  const dispatcher = config.TELEGRAM_PROXY_URL
    ? new ProxyAgent(config.TELEGRAM_PROXY_URL)
    : undefined;
  let stopped = false;
  let activeController: AbortController | null = null;

  const call = async (method: string, body: Record<string, unknown>): Promise<TelegramApiResponse> => {
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), (POLL_SECONDS + 10) * 1_000);
    try {
      const response = await undiciFetch(
        `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          dispatcher,
          signal: controller.signal,
        },
      );
      const result = await response.json().catch(() => ({})) as TelegramApiResponse;
      if (!response.ok || result.ok !== true) {
        throw new Error(result.description ?? `Telegram Bot API HTTP ${response.status}`);
      }
      return result;
    } finally {
      clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
  };

  const task = (async () => {
    let offset = 0;
    let webhookDeleted = false;
    while (!stopped) {
      try {
        if (!webhookDeleted) {
          await call('deleteWebhook', { drop_pending_updates: false });
          webhookDeleted = true;
          logger.info('Telegram update delivery switched to proxy long polling');
        }

        const response = await call('getUpdates', {
          offset,
          timeout: POLL_SECONDS,
          allowed_updates: ['message', 'callback_query'],
        });
        const updates = Array.isArray(response.result) ? response.result : [];
        for (const rawUpdate of updates) {
          if (!rawUpdate || typeof rawUpdate !== 'object') continue;
          const updateId = Number((rawUpdate as { update_id?: unknown }).update_id);
          if (!Number.isSafeInteger(updateId) || updateId < 0) continue;
          const parsed = telegramUpdateSchema.safeParse(rawUpdate);
          if (!parsed.success) {
            logger.warn({ updateId }, 'Skipped invalid Telegram update');
            offset = updateId + 1;
            continue;
          }
          await processTelegramUpdate(parsed.data, onAction);
          offset = updateId + 1;
        }
      } catch (error) {
        if (stopped) break;
        logger.warn({ error: safeError(error) }, 'Telegram long polling request failed');
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  })();

  return async () => {
    stopped = true;
    activeController?.abort();
    await task;
    await dispatcher?.close();
  };
}
