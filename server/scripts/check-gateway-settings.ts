import { config } from '../config';
import { db } from '../db';
import { telegramWebhookUrl, validateGatewayConfiguration } from '../gateway';
import { closeGatewayDispatcher } from '../gateway-proxy';
import { readGatewaySettings } from '../gateway-settings';
import { callTelegramApi } from '../telegram-bot';

try {
  const settings = await readGatewaySettings();
  validateGatewayConfiguration(settings);
  telegramWebhookUrl(settings);
  if (!config.TELEGRAM_BOT_TOKEN || !/^[A-Za-z0-9_-]{1,256}$/u.test(config.TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error('Telegram is not configured');
  }
  await callTelegramApi('getMe', {});
  console.log('Gateway settings and Telegram connectivity verified.');
} catch {
  console.error('Gateway preflight failed. Configure the database before activating this release.');
  process.exitCode = 1;
} finally {
  await closeGatewayDispatcher();
  await db.end();
}
