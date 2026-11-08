import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';

import { firstRow } from './db';
import { promotionSettingsSchema, readPromotionSettings, savePromotionSettings } from './promotion-settings';
import type { AuthUser } from './security';

export function registerPromotionRoutes(app: FastifyInstance, authenticateAdmin: (request: FastifyRequest) => Promise<AuthUser>) {
  const authorize = async (request: FastifyRequest) => {
    const session = await authenticateAdmin(request);
    const role = await firstRow<RowDataPacket>(
      "SELECT user_id FROM user_roles WHERE user_id = ? AND role = 'admin'", [session.id],
    );
    if (!role) throw Object.assign(new Error('Недостаточно прав'), { statusCode: 403, code: 'FORBIDDEN' });
    return session;
  };
  app.get('/v1/admin/promotion-settings', async (request, reply) => {
    await authorize(request);
    reply.header('Cache-Control', 'no-store');
    return { data: await readPromotionSettings() };
  });
  app.put('/v1/admin/promotion-settings', async request => {
    const session = await authorize(request);
    const parsed = promotionSettingsSchema.safeParse(request.body);
    if (!parsed.success) throw Object.assign(new Error('Укажите целый процент от 0 до 100, текст акции до 600 символов и текст на кнопках до 160 символов.'), {
      statusCode: 400, code: 'VALIDATION_ERROR',
    });
    return { data: await savePromotionSettings(parsed.data, session.id, request.ip) };
  });
}
