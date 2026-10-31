import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import { config } from './config';
import { db, withTransaction } from './db';
import { hasCurrentInitialConsents } from './legal';
import { verifyMiniAppLaunch, verifyMaxMiniAppContact, type MiniAppIdentity, type MiniAppProvider } from './mini-app-auth';
import { findOrCreatePhoneUser, findUserWithRoles, linkMessengerIdentity } from './repositories';
import { signSession } from './security';

const launchSchema = z.object({ initData: z.string().min(1).max(16384) }).strict();
const loginSchema = launchSchema.extend({
  contact: z.object({ phone: z.string().max(20), authDate: z.string().max(20), hash: z.string().max(128) }).strict().optional(),
  contactRequestId: z.string().uuid().optional(),
}).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(new Error('Некорректные данные входа.'), { statusCode: 400, code: 'INVALID_INPUT' });
  return result.data;
}

function launch(provider: MiniAppProvider, initData: string): MiniAppIdentity {
  const botToken = provider === 'max' ? config.MAX_BOT_TOKEN : config.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw Object.assign(new Error('Вход временно недоступен.'), { statusCode: 503, code: 'MINI_APP_NOT_CONFIGURED' });
  return verifyMiniAppLaunch({ provider, initData, botToken });
}

export function registerMiniAppRoutes(app: FastifyInstance): void {
  app.post('/v1/auth/mini-app/telegram/contact', {
    logLevel: 'warn', config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const identity = launch('telegram', parse(launchSchema, request.body).initData);
    const requestId = randomUUID();
    await db.execute(`INSERT INTO mini_app_phone_challenges (external_user_id, request_id, expires_at)
      VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE))
      ON DUPLICATE KEY UPDATE request_id = VALUES(request_id), verified_phone = NULL,
        verified_at = NULL, consumed_at = NULL, expires_at = VALUES(expires_at), created_at = UTC_TIMESTAMP(3)`,
    [identity.userId, requestId]);
    return { data: { requestId } };
  });

  for (const provider of ['max', 'telegram'] as const) {
    app.post(`/v1/auth/mini-app/${provider}`, {
      logLevel: 'warn', config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const input = parse(loginSchema, request.body);
      const identity = launch(provider, input.initData);
      if ((provider === 'telegram' && input.contact) || (provider === 'max' && input.contactRequestId)) {
        throw Object.assign(new Error('Неподдерживаемый способ подтверждения телефона.'), { statusCode: 400 });
      }
      const maxPhone = provider === 'max' && input.contact
        ? verifyMaxMiniAppContact({ ...input.contact, userId: identity.userId, botToken: config.MAX_BOT_TOKEN })
        : null;
      const userId = await withTransaction(async connection => {
        const [linked] = await connection.query<(RowDataPacket & {
          user_id: string; phone: string | null; chat_id: string; bot_contact_available: number;
        })[]>(`SELECT account.user_id, account.chat_id, account.bot_contact_available, user.phone
          FROM user_messenger_accounts account JOIN users user ON user.id = account.user_id AND user.deleted_at IS NULL
          WHERE account.provider = ? AND account.external_user_id = ? AND account.active = TRUE LIMIT 1 FOR UPDATE`,
        [provider, identity.userId]);
        const account = linked[0];
        let phone = maxPhone;
        if (provider === 'telegram' && input.contactRequestId) {
          const [proof] = await connection.query<(RowDataPacket & { verified_phone: string | null })[]>(
            `SELECT verified_phone FROM mini_app_phone_challenges WHERE external_user_id = ? AND request_id = ?
             AND expires_at > UTC_TIMESTAMP(3) AND consumed_at IS NULL FOR UPDATE`, [identity.userId, input.contactRequestId]);
          phone = proof[0]?.verified_phone ?? null;
        }
        if (!account?.phone && !phone && !input.contactRequestId && !input.contact) {
          // A passenger may open the mini app immediately after sharing their
          // phone in the bot, before the originating browser has polled login.
          // Reuse only a recent, successful server-side proof for this signed ID.
          const [proof] = await connection.query<(RowDataPacket & { verified_phone: string })[]>(
            `SELECT verified_phone FROM ${provider}_auth_challenges WHERE ${provider}_user_id = ?
             AND verified_at IS NOT NULL AND verified_phone IS NOT NULL AND failure_code IS NULL
             AND (expected_phone IS NULL OR expected_phone = verified_phone)
             AND expires_at > UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [identity.userId]);
          phone = proof[0]?.verified_phone ?? null;
        }
        if (!account?.phone && !phone) return null;
        // An already linked account is authoritative. A changed phone must use
        // the existing explicit account-linking flow, never silently merge users.
        if (account?.phone && phone && account.phone !== phone) throw Object.assign(new Error('Номер отличается от номера профиля. Обратитесь в поддержку.'), { statusCode: 409, code: 'PHONE_MISMATCH' });
        const id = account?.user_id ?? await findOrCreatePhoneUser(connection, phone!);
        if (account && !account.phone && phone) {
          const [owners] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE phone = ? AND id <> ? AND deleted_at IS NULL FOR UPDATE', [phone, id]);
          if (owners.length) throw Object.assign(new Error('Номер уже связан с другим профилем. Обратитесь в поддержку.'), { statusCode: 409, code: 'PHONE_ALREADY_LINKED' });
          await connection.execute('UPDATE users SET phone = ?, phone_verified_at = UTC_TIMESTAMP(3) WHERE id = ?', [phone, id]);
        }
        await linkMessengerIdentity(connection, id, {
          provider, externalUserId: identity.userId, chatId: account?.chat_id ?? identity.chatId,
          firstName: identity.firstName, lastName: identity.lastName, username: identity.username,
          botContactAvailable: Boolean(account?.bot_contact_available || identity.canMessage || (provider === 'telegram' && phone)),
        });
        await connection.execute(`UPDATE users SET profile_completed_at = COALESCE(profile_completed_at, UTC_TIMESTAMP(3))
          WHERE id = ? AND TRIM(name) <> ''`, [id]);
        if (provider === 'telegram' && input.contactRequestId && phone) await connection.execute(
          'UPDATE mini_app_phone_challenges SET consumed_at = UTC_TIMESTAMP(3) WHERE external_user_id = ? AND request_id = ?',
          [identity.userId, input.contactRequestId]);
        return id;
      });
      if (!userId) return { data: { status: 'phone_required' } };
      const user = await findUserWithRoles(userId);
      if (!user || user.blockedAt) throw Object.assign(new Error('Вход в этот профиль недоступен. Обратитесь в поддержку.'), { statusCode: 403, code: 'ACCOUNT_BLOCKED' });
      return { data: { status: 'verified', token: await signSession({ id: user.id, roles: user.roles }), user,
        legalConsentRequired: !(await withTransaction(connection => hasCurrentInitialConsents(connection, user.id))),
      } };
    });
  }
}
