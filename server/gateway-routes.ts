import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';

import { firstRow } from './db';
import { gatewayUpdateSchema, presentGatewaySettings } from './gateway';
import { readGatewaySettings, saveGatewaySettings } from './gateway-settings';
import type { AuthUser } from './security';
import { callTelegramApi } from './telegram-bot';
import { registerTelegramWebhook, telegramWebhookStatus } from './telegram-webhook';

export function registerGatewayRoutes(
  app: FastifyInstance,
  authenticateAdmin: (request: FastifyRequest) => Promise<AuthUser>,
) {
  const authorize = async (request: FastifyRequest) => {
    const session = await authenticateAdmin(request);
    // Recheck the stored superadmin role, including sessions issued before a role was revoked.
    const role = await firstRow<RowDataPacket>(
      "SELECT user_id FROM user_roles WHERE user_id = ? AND role = 'admin'", [session.id],
    );
    if (!role) throw Object.assign(new Error('Недостаточно прав'), { statusCode: 403, code: 'FORBIDDEN' });
    return session;
  };

  app.get('/v1/admin/gateway-settings', async (request) => {
    await authorize(request);
    return { data: presentGatewaySettings(await readGatewaySettings()) };
  });

  app.put('/v1/admin/gateway-settings', async (request) => {
    const session = await authorize(request);
    const parsed = gatewayUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')), {
        statusCode: 400, code: 'VALIDATION_ERROR',
      });
    }
    return { data: await saveGatewaySettings(parsed.data, session.id, request.ip) };
  });

  const networkOptions = { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } };
  const safely = async <T>(work: () => Promise<T>) => {
    try {
      return { data: await work() };
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 400) throw error;
      // Upstream errors can contain signed URLs or proxy credentials. Never log or return them.
      throw Object.assign(new Error('Не удалось связаться с Telegram. Проверьте сохранённые настройки и повторите попытку'), {
        statusCode: 400, code: 'GATEWAY_CONNECTION_FAILED',
      });
    }
  };
  app.post('/v1/admin/gateway-settings/test', networkOptions, async (request) => {
    await authorize(request);
    return safely(async () => {
      const bot = await callTelegramApi<{ username: string }>('getMe', {});
      return { connected: true, botUsername: bot.username };
    });
  });
  app.get('/v1/admin/gateway-settings/telegram', networkOptions, async (request) => {
    await authorize(request);
    return safely(telegramWebhookStatus);
  });
  app.post('/v1/admin/gateway-settings/telegram', networkOptions, async (request) => {
    await authorize(request);
    return safely(registerTelegramWebhook);
  });
}
