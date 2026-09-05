import type { TelegramWebhookStatus } from '../src/domain/gateway';
import { config } from './config';
import { telegramWebhookUrl } from './gateway';
import { readGatewaySettings } from './gateway-settings';
import { callTelegramApi } from './telegram-bot';

export async function telegramWebhookStatus(): Promise<TelegramWebhookStatus> {
  const settings = await readGatewaySettings();
  const result = await callTelegramApi<{
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }>('getWebhookInfo', {});
  return {
    configured: Boolean(result.url),
    matchesSettings: Boolean(settings.apiPublicUrl) && result.url === telegramWebhookUrl(settings),
    gateway: Boolean(result.url) && result.url.startsWith(`${settings.webhookUrl}?`),
    pendingUpdates: result.pending_update_count,
    lastErrorAt: result.last_error_date ? new Date(result.last_error_date * 1_000).toISOString() : null,
    hasDeliveryError: Boolean(result.last_error_message),
  };
}

export async function registerTelegramWebhook(): Promise<TelegramWebhookStatus> {
  if (!config.TELEGRAM_BOT_TOKEN || !/^[A-Za-z0-9_-]{1,256}$/u.test(config.TELEGRAM_WEBHOOK_SECRET)) {
    throw Object.assign(new Error('На сервере не настроен токен бота или секрет Telegram'), { statusCode: 400, code: 'TELEGRAM_NOT_CONFIGURED' });
  }
  const settings = await readGatewaySettings();
  await callTelegramApi('setWebhook', {
    url: telegramWebhookUrl(settings),
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
    max_connections: 20,
  });
  const status = await telegramWebhookStatus();
  if (!status.matchesSettings) throw new Error('Telegram не подтвердил адрес вебхука. Повторите регистрацию.');
  return status;
}
