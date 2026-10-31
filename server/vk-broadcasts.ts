import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import { broadcastCommunities, broadcastCommunity, type BroadcastCommunity } from './vk-broadcast-communities';
import { db, firstRow, withTransaction } from './db';
import { authenticate } from './security';

const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw fail(400, 'Проверьте заполненные данные');
  return result.data;
}
const idSchema = z.object({ id: z.uuid() });
const imageSchema = z.object({ base64: z.string().min(16).max(3_400_000), mimeType: z.enum(['image/jpeg', 'image/png']) }).strict();
const draftSchema = z.object({ title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(3500),
  image: imageSchema.nullable(), revision: z.number().int().positive().optional() }).strict();
const runSchema = z.object({ id: z.uuid(), mode: z.enum(['test', 'all']), revision: z.number().int().positive(),
  audienceGeneration: z.uuid().optional(), expectedCount: z.number().int().positive().optional() }).strict();

export function decodeBroadcastImage(input: z.infer<typeof imageSchema> | null): Buffer | null {
  if (!input) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(input.base64) || input.base64.length % 4 !== 0) throw fail(400, 'Повреждённое изображение');
  const bytes = Buffer.from(input.base64, 'base64');
  if (bytes.length > 2_500_000) throw fail(413, 'Изображение должно быть не больше 2,5 МБ');
  const valid = input.mimeType === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!valid) throw fail(400, 'Выберите изображение JPEG или PNG');
  return bytes;
}

export async function broadcastAdminPeers(connection: Pick<PoolConnection, 'query'> = db): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(`SELECT DISTINCT a.external_user_id AS id
    FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
    JOIN user_messenger_accounts a ON a.user_id = u.id AND a.provider = 'vk' AND a.active = TRUE
    WHERE u.deleted_at IS NULL AND u.blocked_at IS NULL`);
  return rows.map(r => String(r.id)).filter(isVkUserId);
}
export function isVkUserId(value: unknown): boolean {
  return /^[1-9]\d{0,15}$/u.test(String(value)) && Number.isSafeInteger(Number(value));
}
async function adminId(request: FastifyRequest): Promise<string> {
  const session = await authenticate(request);
  const row = await firstRow<RowDataPacket>(`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = ? AND r.role = 'admin' AND u.deleted_at IS NULL AND u.blocked_at IS NULL`, [session.id]);
  if (!row) throw fail(403, 'Требуются права администратора');
  return session.id;
}
function configured(community: BroadcastCommunity) {
  if (!community.token || !isVkUserId(community.id)) throw fail(409, 'Сообщество ВК ещё не подключено');
}
export async function recordVkBroadcastPermission(peer: string, allowed: boolean, communityKey = 'taxi') {
  if (!isVkUserId(peer)) return;
  await db.execute(`INSERT INTO vk_broadcast_audience (community_key, peer_id, allowed, checked_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), checked_at = VALUES(checked_at)`, [communityKey, peer, allowed]);
}
const campaignColumns = `id, title, message_text AS text, revision, launched, image_bytes IS NOT NULL AS hasImage, updated_at AS updatedAt`;
const jsonCampaign = (r: RowDataPacket) => ({ ...r, launched: !!r.launched, hasImage: !!r.hasImage });

function communityFrom(request: FastifyRequest): BroadcastCommunity {
  return broadcastCommunity(parse(z.object({ community: z.string() }), request.params).community);
}

export function registerVkBroadcastRoutes(app: FastifyInstance) {
  app.get('/v1/admin/broadcasts/:community', async (request, reply) => {
    await adminId(request); const community = communityFrom(request); reply.header('Cache-Control', 'no-store');
    const sync = await firstRow<RowDataPacket>(`SELECT generation, status, stage, members_count AS membersCount,
      started_at AS startedAt, finished_at AS finishedAt, last_error AS lastError FROM vk_broadcast_sync WHERE community_key = ?`, [community.key]);
    const audience = await firstRow<RowDataPacket>(`SELECT COUNT(*) AS total, COALESCE(SUM(allowed = TRUE),0) AS allowed,
      COALESCE(SUM(checked_at >= (SELECT started_at FROM vk_broadcast_sync WHERE community_key = ?)),0) AS checked FROM vk_broadcast_audience WHERE community_key = ?`, [community.key, community.key]);
    const [campaigns] = await db.query<RowDataPacket[]>(`SELECT ${campaignColumns} FROM vk_broadcast_campaigns WHERE community_key = ? ORDER BY updated_at DESC LIMIT 50`, [community.key]);
    const [runs] = await db.query<RowDataPacket[]>(`SELECT r.id, r.campaign_id AS campaignId, c.title, r.revision, r.mode, r.status,
      r.created_at AS createdAt, r.finished_at AS finishedAt, r.last_error AS lastError,
      COUNT(d.id) AS total, COALESCE(SUM(d.status = 'sent'),0) AS sent, COALESCE(SUM(d.status = 'skipped'),0) AS skipped,
      COALESCE(SUM(d.status = 'failed'),0) AS failed, COALESCE(SUM(d.status = 'pending'),0) AS pending
      FROM (SELECT id, campaign_id, revision, mode, status, created_at, finished_at, last_error
        FROM vk_broadcast_runs WHERE community_key = ? ORDER BY created_at DESC LIMIT 30) r
      JOIN vk_broadcast_campaigns c ON c.id = r.campaign_id LEFT JOIN vk_broadcast_deliveries d ON d.run_id = r.id
      GROUP BY r.id ORDER BY r.created_at DESC`, [community.key]);
    return { data: { configured: !!community.token && isVkUserId(community.id), communityId: community.id,
      communities: broadcastCommunities().map(({ key, id, name, token }) => ({ key, id, name, configured: !!token && isVkUserId(id) })),
      adminCount: (await broadcastAdminPeers()).length, sync: { ...sync,
        fresh: sync?.status === 'ready' && !!sync.finishedAt && Date.now() - new Date(sync.finishedAt).getTime() <= 86_400_000 },
      audience: Object.fromEntries(Object.entries(audience ?? {}).map(([k, v]) => [k, Number(v)])),
      campaigns: campaigns.map(jsonCampaign), runs: runs.map(r => ({ ...r, total: Number(r.total), sent: Number(r.sent),
        skipped: Number(r.skipped), failed: Number(r.failed), pending: Number(r.pending) })) } };
  });
  app.post('/v1/admin/broadcasts/:community/audience/sync', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async request => {
    await adminId(request); const community = communityFrom(request); configured(community);
    return withTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>('SELECT * FROM vk_broadcast_sync WHERE community_key = ? FOR UPDATE', [community.key]);
      if (rows[0]!.status === 'syncing') return { data: { started: false } };
      if (rows[0]!.started_at && Date.now() - new Date(rows[0]!.started_at).getTime() < 60_000) throw fail(429, 'Аудиторию можно обновлять раз в минуту');
      await connection.execute(`UPDATE vk_broadcast_sync SET generation = ?, status = 'syncing', stage = 'members', page_offset = 0,
        attempts = 0, last_error = NULL, started_at = UTC_TIMESTAMP(3), finished_at = NULL, next_attempt_at = NULL WHERE community_key = ?`, [randomUUID(), community.key]);
      return { data: { started: true } };
    });
  });
  app.get('/v1/admin/broadcasts/:community/campaigns/:id', async (request, reply) => {
    await adminId(request); const community = communityFrom(request); reply.header('Cache-Control', 'no-store');
    const { id } = parse(idSchema, request.params);
    const row = await firstRow<RowDataPacket>(`SELECT ${campaignColumns}, image_mime, image_bytes FROM vk_broadcast_campaigns WHERE id = ? AND community_key = ?`, [id, community.key]);
    if (!row) throw fail(404, 'Рассылка не найдена');
    const { image_mime, image_bytes, ...rest } = row;
    return { data: { ...jsonCampaign(rest as RowDataPacket), image: image_bytes ? { mimeType: image_mime, base64: image_bytes.toString('base64') } : null } };
  });
  // PUT with a client UUID makes saving a new draft safe to repeat after a network timeout.
  app.put('/v1/admin/broadcasts/:community/campaigns/:id', { bodyLimit: 3_600_000, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const owner = await adminId(request); const community = communityFrom(request);
    const { id } = parse(idSchema, request.params);
    const input = parse(draftSchema, request.body);
    const image = decodeBroadcastImage(input.image);
    return withTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>('SELECT * FROM vk_broadcast_campaigns WHERE id = ? FOR UPDATE', [id]);
      const old = rows[0];
      if (old && old.community_key !== community.key) throw fail(404, 'Рассылка не найдена');
      if (old?.launched) throw fail(409, 'Рассылка уже запущена. Создайте копию для нового сообщения');
      if (old && input.revision !== old.revision) {
        if (old.title === input.title && old.message_text === input.text && old.image_mime === (input.image?.mimeType ?? null)
          && (image ? image.equals(old.image_bytes ?? Buffer.alloc(0)) : !old.image_bytes)) return { data: { id, revision: old.revision } };
        throw fail(409, 'Черновик изменён в другом окне. Откройте его заново');
      }
      const revision = old ? old.revision + 1 : 1;
      await connection.execute(`INSERT INTO vk_broadcast_campaigns (id, community_key, title, message_text, image_mime, image_bytes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), message_text = VALUES(message_text),
        image_mime = VALUES(image_mime), image_bytes = VALUES(image_bytes), revision = ?, updated_at = UTC_TIMESTAMP(3)`,
      [id, community.key, input.title, input.text, input.image?.mimeType ?? null, image, owner, revision]);
      return { data: { id, revision } };
    });
  });
  app.post('/v1/admin/broadcasts/:community/campaigns/:id/runs', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async request => {
    const owner = await adminId(request); const community = communityFrom(request); configured(community);
    const { id } = parse(idSchema, request.params);
    const input = parse(runSchema, request.body);
    return withTransaction(async connection => {
      // A single lock serializes launch/cooldown checks across administrators and API processes.
      const [syncRows] = await connection.query<RowDataPacket[]>('SELECT * FROM vk_broadcast_sync WHERE community_key = ? FOR UPDATE', [community.key]);
      const [campaigns] = await connection.query<RowDataPacket[]>('SELECT * FROM vk_broadcast_campaigns WHERE id = ? AND community_key = ? FOR UPDATE', [id, community.key]);
      const campaign = campaigns[0];
      if (!campaign) throw fail(404, 'Рассылка не найдена');
      const [prior] = await connection.query<RowDataPacket[]>('SELECT id, campaign_id, mode, revision, community_key FROM vk_broadcast_runs WHERE id = ?', [input.id]);
      if (prior[0]) {
        if (prior[0].community_key !== community.key || prior[0].campaign_id !== id || prior[0].mode !== input.mode || prior[0].revision !== input.revision) throw fail(409, 'Повторный запрос не совпадает с исходным');
        return { data: { id: prior[0].id } };
      }
      if (campaign.launched) throw fail(409, 'Эта рассылка уже была запущена');
      if (campaign.revision !== input.revision) throw fail(409, 'Черновик изменён. Сначала откройте актуальную версию');
      const [recent] = await connection.query<RowDataPacket[]>(`SELECT id FROM vk_broadcast_runs
        WHERE community_key = ? AND mode = ? AND created_at > UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE LIMIT 1`, [community.key, input.mode]);
      if (recent.length) throw fail(429, 'Подождите минуту перед повторной отправкой');
      let peers: string[];
      if (input.mode === 'test') {
        peers = await broadcastAdminPeers(connection);
        if (!peers.length) throw fail(409, 'У администраторов нет привязанного ВК. Войдите через ВК и разрешите сообщения сообщества');
      } else {
        const sync = syncRows[0]!;
        if (sync.status !== 'ready' || sync.generation !== input.audienceGeneration || !sync.finished_at
          || Date.now() - new Date(sync.finished_at).getTime() > 86_400_000) throw fail(409, 'Обновите аудиторию перед отправкой');
        const [audience] = await connection.query<RowDataPacket[]>('SELECT peer_id FROM vk_broadcast_audience WHERE community_key = ? AND allowed = TRUE AND checked_at >= ?', [community.key, sync.started_at]);
        peers = audience.map(r => String(r.peer_id));
        if (!peers.length || peers.length !== input.expectedCount) throw fail(409, 'Количество получателей изменилось. Проверьте аудиторию ещё раз');
        await connection.execute('UPDATE vk_broadcast_campaigns SET launched = TRUE WHERE id = ?', [id]);
      }
      await connection.execute(`INSERT INTO vk_broadcast_runs
        (id, community_key, campaign_id, revision, mode, message_text, image_mime, image_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.id, community.key, id, campaign.revision, input.mode, campaign.message_text, campaign.image_mime, campaign.image_bytes, owner]);
      // Bounded SQL batches; API callers cannot supply recipient IDs, including in test mode.
      for (let offset = 0; offset < peers.length; offset += 500) {
        const batch = peers.slice(offset, offset + 500);
        await connection.query('INSERT INTO vk_broadcast_deliveries (run_id, peer_id) VALUES ?', [batch.map(peer => [input.id, peer])]);
      }
      return { data: { id: input.id } };
    });
  });
  app.post('/v1/admin/broadcasts/:community/runs/:id/cancel', async request => {
    await adminId(request); const community = communityFrom(request); const { id } = parse(idSchema, request.params);
    await db.execute(`UPDATE vk_broadcast_runs SET status = 'cancelled', finished_at = UTC_TIMESTAMP(3)
      WHERE id = ? AND community_key = ? AND status IN ('queued', 'sending')`, [id, community.key]);
    return { data: { cancelled: true } };
  });
}
