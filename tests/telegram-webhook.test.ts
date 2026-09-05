import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultGatewaySettings } from '../src/domain/gateway';
import { config } from '../server/config';
import { telegramWebhookUrl } from '../server/gateway';
import { readGatewaySettings } from '../server/gateway-settings';
import { callTelegramApi } from '../server/telegram-bot';
import { registerTelegramWebhook, telegramWebhookStatus } from '../server/telegram-webhook';

vi.mock('../server/gateway-settings', () => ({ readGatewaySettings: vi.fn() }));
vi.mock('../server/telegram-bot', () => ({ callTelegramApi: vi.fn() }));
vi.mock('../server/config', () => ({ config: { TELEGRAM_BOT_TOKEN: 'test-bot-token', TELEGRAM_WEBHOOK_SECRET: 'test-provider-secret' } }));

const settings = { ...defaultGatewaySettings, webhooksEnabled: true, project: 'taxigr',
  apiPublicUrl: 'https://api.taxigr.ru', webhookSecret: 'separate-project-key', proxyPassword: '' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readGatewaySettings).mockResolvedValue(settings);
});

describe('Telegram webhook registration', () => {
  it('registers a signed URL, keeps queued events and verifies the actual registration', async () => {
    vi.mocked(callTelegramApi).mockResolvedValueOnce(true).mockResolvedValueOnce({
      url: telegramWebhookUrl(settings), pending_update_count: 3,
    });
    const status = await registerTelegramWebhook();
    expect(callTelegramApi).toHaveBeenNthCalledWith(1, 'setWebhook', {
      url: telegramWebhookUrl(settings), secret_token: config.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'], drop_pending_updates: false, max_connections: 20,
    });
    expect(status).toMatchObject({ matchesSettings: true, gateway: true, pendingUpdates: 3 });
    expect(JSON.stringify(status)).not.toContain('sig=');
  });

  it('reports a stale webhook without returning its signed URL or upstream message', async () => {
    vi.mocked(callTelegramApi).mockResolvedValue({ url: 'https://old.example/hook?secret=private',
      pending_update_count: 8, last_error_date: 1_700_000_000, last_error_message: 'https://old.example/hook?secret=private' });
    const status = await telegramWebhookStatus();
    expect(status).toMatchObject({ configured: true, matchesSettings: false, pendingUpdates: 8, hasDeliveryError: true });
    expect(JSON.stringify(status)).not.toContain('private');
  });

  it('fails if Telegram does not retain the requested URL', async () => {
    vi.mocked(callTelegramApi).mockResolvedValueOnce(true).mockResolvedValueOnce({ url: '', pending_update_count: 0 });
    await expect(registerTelegramWebhook()).rejects.toThrow('не подтвердил');
  });
});
