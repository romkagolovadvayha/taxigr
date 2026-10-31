import { setTimeout as delay } from 'node:timers/promises';
import type { RowDataPacket } from 'mysql2/promise';

import { broadcastCommunities, type BroadcastCommunity } from './vk-broadcast-communities';
import { db, firstRow } from './db';
import { callVkApi, VkApiError, vkInlineKeyboard } from './vk-bot';
import { broadcastAdminPeers, isVkUserId, recordVkBroadcastPermission } from './vk-broadcasts';

// A background budget, independent of page polling. Leave capacity for order notifications.
async function api<T>(community: BroadcastCommunity, method: string, params: Record<string, string>): Promise<T> {
  const started = Date.now();
  try { return await callVkApi<T>(method, params, community.token); }
  finally { await delay(Math.max(0, 550 - (Date.now() - started))); }
}
export function broadcastError(error: unknown): { message: string; retry: boolean; denied: boolean } {
  const code = error instanceof VkApiError ? error.vkCode : 0;
  if (code === 936) return { message: 'ВК не нашёл контакт получателя (код 936)', retry: false, denied: true };
  if ([18, 900, 901, 902, 917].includes(code)) return { message: `Получатель недоступен или запретил сообщения (ВК ${code})`, retry: false, denied: true };
  if ([5, 7, 15, 27, 28].includes(code)) return { message: `Проверьте доступ сообщества к сообщениям (ВК ${code})`, retry: false, denied: false };
  if ([9, 29].includes(code)) return { message: `ВК ограничил рассылку. Отправка остановлена (ВК ${code})`, retry: false, denied: false };
  if (code === 912) return { message: 'Включите возможности ботов в настройках сообщений сообщества ВК', retry: false, denied: false };
  const retry = !code || [6, 10, 429, 500, 502, 503, 504].includes(code);
  return { message: retry ? 'ВК временно недоступен. Повторим с задержкой' : `ВК отклонил запрос (код ${code})`, retry, denied: false };
}
const retryAt = (attempts: number) => new Date(Date.now() + Math.min(900_000, 30_000 * 2 ** Math.min(attempts, 5)));

async function remember(community: BroadcastCommunity, peers: unknown[]) {
  const valid = [...new Set(peers.map(String).filter(isVkUserId))];
  for (let offset = 0; offset < valid.length; offset += 500) {
    await db.query('INSERT IGNORE INTO vk_broadcast_audience (community_key, peer_id) VALUES ?', [valid.slice(offset, offset + 500).map(id => [community.key, id])]);
  }
}

async function syncAudience(community: BroadcastCommunity, sync: RowDataPacket) {
  try {
    if (sync.stage === 'members') {
      const result = await api<{ count: number; items: number[] }>(community, 'groups.getMembers', {
        group_id: community.id, count: '1000', offset: String(sync.page_offset), sort: 'id_asc',
      });
      await remember(community, result.items);
      const done = result.items.length === 0 || sync.page_offset + result.items.length >= result.count;
      await db.execute(`UPDATE vk_broadcast_sync SET stage = ?, page_offset = ?, members_count = ?, attempts = 0, last_error = NULL WHERE community_key = ?`,
        [done ? 'conversations' : 'members', done ? 0 : sync.page_offset + result.items.length, result.count, community.key]);
    } else if (sync.stage === 'conversations' || sync.stage === 'archive') {
      const result = await api<{ count: number; items: { conversation: { peer: { id: number; type: string } } }[] }>(community, 'messages.getConversations', {
        count: '200', offset: String(sync.page_offset), filter: sync.stage === 'archive' ? 'archive' : 'all', group_id: community.id,
      });
      await remember(community, result.items.filter(item => item.conversation.peer.type === 'user').map(item => item.conversation.peer.id));
      const done = result.items.length === 0 || sync.page_offset + result.items.length >= result.count;
      await db.execute('UPDATE vk_broadcast_sync SET stage = ?, page_offset = ?, attempts = 0, last_error = NULL WHERE community_key = ?',
        [done ? (sync.stage === 'archive' ? 'accounts' : 'archive') : sync.stage, done ? 0 : sync.page_offset + result.items.length, community.key]);
    } else if (sync.stage === 'accounts') {
      // Include linked users even if they are no longer members, plus previous permission callbacks.
      const [rows] = await db.query<RowDataPacket[]>(`SELECT external_user_id AS id FROM user_messenger_accounts WHERE provider = 'vk'
        UNION SELECT vk_id AS id FROM users WHERE vk_id IS NOT NULL`);
      await remember(community, rows.map(r => r.id));
      await db.execute("UPDATE vk_broadcast_sync SET stage = 'permissions', attempts = 0, last_error = NULL WHERE community_key = ?", [community.key]);
    } else {
      const [rows] = await db.query<RowDataPacket[]>(`SELECT peer_id FROM vk_broadcast_audience
        WHERE community_key = ? AND (checked_at IS NULL OR checked_at < ?) ORDER BY peer_id LIMIT 25`, [community.key, sync.started_at]);
      if (!rows.length) {
        await db.execute("UPDATE vk_broadcast_sync SET status = 'ready', finished_at = UTC_TIMESTAMP(3), last_error = NULL WHERE community_key = ?", [community.key]);
        return;
      }
      // execute batches reads, never sends. Partial failures must not be mistaken for a denied permission.
      const code = `return [${rows.map(r => `API.messages.isMessagesFromGroupAllowed({"group_id":${JSON.stringify(community.id)},"user_id":${JSON.stringify(String(r.peer_id))}})`).join(',')}];`;
      const results = await api<({ is_allowed?: number | boolean } | false)[]>(community, 'execute', { code });
      if (!Array.isArray(results) || results.length !== rows.length || results.some(r => !r || r.is_allowed === undefined)) throw new VkApiError(10, 'Permission batch incomplete');
      for (let i = 0; i < rows.length; i++) {
        const result = results[i];
        await recordVkBroadcastPermission(String(rows[i]!.peer_id), !!result && (result.is_allowed === true || result.is_allowed === 1), community.key);
      }
      await db.execute('UPDATE vk_broadcast_sync SET attempts = 0, last_error = NULL WHERE community_key = ?', [community.key]);
    }
  } catch (error) {
    // VK documents archive in the shared schema, but community tokens cannot read it.
    // The all-conversations pass already succeeded; keep members, dialogs and linked accounts.
    if (sync.stage === 'archive' && error instanceof VkApiError && error.vkCode === 15) {
      await db.execute("UPDATE vk_broadcast_sync SET stage = 'accounts', page_offset = 0, attempts = 0, last_error = NULL WHERE community_key = ?", [community.key]);
      return;
    }
    const problem = broadcastError(error), attempts = sync.attempts + 1;
    await db.execute('UPDATE vk_broadcast_sync SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE community_key = ?',
      [problem.retry && attempts < 5 ? 'syncing' : 'failed', attempts, retryAt(attempts), problem.message, community.key]);
  }
}

export function validateVkUploadUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !['vk.com', 'userapi.com', 'vk-cdn.net', 'vkuserphoto.ru'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new VkApiError(100, 'Unexpected VK upload server');
  }
  return url;
}
async function uploadImage(community: BroadcastCommunity, run: RowDataPacket, peerId: string): Promise<string> {
  const server = await api<{ upload_url: string }>(community, 'photos.getMessagesUploadServer', { peer_id: peerId });
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(run.image_bytes)], { type: run.image_mime }), run.image_mime === 'image/png' ? 'broadcast.png' : 'broadcast.jpg');
  const response = await fetch(validateVkUploadUrl(server.upload_url), { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new VkApiError(response.status, 'VK photo upload failed');
  const uploaded = await response.json() as { photo?: string; server?: number; hash?: string };
  if (!uploaded.photo || uploaded.photo === '[]' || !uploaded.server || !uploaded.hash) throw new VkApiError(10, 'VK photo upload incomplete');
  const photos = await api<{ id: number; owner_id: number; access_key?: string }[]>(community, 'photos.saveMessagesPhoto', {
    photo: uploaded.photo, server: String(uploaded.server), hash: uploaded.hash,
  });
  const photo = photos[0];
  if (!photo?.id || !photo.owner_id) throw new VkApiError(100, 'Photo not saved');
  return `photo${photo.owner_id}_${photo.id}${photo.access_key ? `_${photo.access_key}` : ''}`;
}

async function deliverRun(community: BroadcastCommunity, run: RowDataPacket) {
  const delivery = await firstRow<RowDataPacket>(`SELECT * FROM vk_broadcast_deliveries WHERE run_id = ? AND status = 'pending'
    AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP(3)) ORDER BY id LIMIT 1`, [run.id]);
  if (!delivery) {
    await db.execute(`UPDATE vk_broadcast_runs SET status = 'completed', finished_at = UTC_TIMESTAMP(3), last_error = NULL
      WHERE id = ? AND status IN ('queued', 'sending') AND NOT EXISTS
      (SELECT 1 FROM vk_broadcast_deliveries WHERE run_id = ? AND status = 'pending')`, [run.id, run.id]);
    return;
  }
  const peerId = String(delivery.peer_id);
  try {
    if (run.mode === 'test' && !(await broadcastAdminPeers()).includes(peerId)) {
      await db.execute("UPDATE vk_broadcast_deliveries SET status = 'skipped', last_error = 'Права администратора отозваны' WHERE id = ?", [delivery.id]);
      return;
    }
    const permission = await api<{ is_allowed?: boolean | number }>(community, 'messages.isMessagesFromGroupAllowed', { group_id: community.id, user_id: peerId });
    if (permission.is_allowed === undefined) throw new VkApiError(10, 'Permission missing');
    const allowed = permission.is_allowed === true || permission.is_allowed === 1;
    await recordVkBroadcastPermission(peerId, allowed, community.key);
    if (!allowed) {
      await db.execute("UPDATE vk_broadcast_deliveries SET status = 'skipped', last_error = 'Нет разрешения на сообщения сообщества' WHERE id = ?", [delivery.id]);
      return;
    }
    if (run.image_bytes && !run.attachment) {
      run.attachment = await uploadImage(community, run, peerId);
      await db.execute('UPDATE vk_broadcast_runs SET attachment = ? WHERE id = ?', [run.attachment, run.id]);
    }
    // Re-read cancellation after potentially slow uploads/permission checks. An already in-flight send cannot be recalled.
    const current = await firstRow<RowDataPacket>('SELECT status FROM vk_broadcast_runs WHERE id = ?', [run.id]);
    if (!current || !['queued', 'sending'].includes(current.status)) return;
    await db.execute("UPDATE vk_broadcast_runs SET status = 'sending', last_error = NULL WHERE id = ? AND status = 'queued'", [run.id]);
    await db.execute('UPDATE vk_broadcast_deliveries SET attempts = attempts + 1 WHERE id = ?', [delivery.id]);
    // Persistent, non-zero ID survives process restarts and ambiguous network timeouts.
    const result = await api<number | { message_id?: number; conversation_message_id?: number }>(community, 'messages.send', {
      peer_id: peerId, random_id: String(delivery.id),
      message: (run.mode === 'test' ? 'Тестовая рассылка · только администраторам\n\n' : '') + run.message_text,
      ...(run.attachment ? { attachment: run.attachment } : {}),
      keyboard: JSON.stringify(vkInlineKeyboard([[{ type: 'link', label: 'Заказать такси', url: 'https://vk.com/app54638428' }]])),
      dont_parse_links: '1',
    });
    const messageId = typeof result === 'number' ? result : result.message_id ?? result.conversation_message_id;
    if (!messageId) throw new VkApiError(10, 'Message acknowledgement missing');
    await db.execute(`UPDATE vk_broadcast_deliveries SET status = 'sent', sent_at = UTC_TIMESTAMP(3), vk_message_id = ?, last_error = NULL WHERE id = ?`, [String(messageId), delivery.id]);
  } catch (error) {
    const problem = broadcastError(error), attempts = delivery.attempts + 1;
    if (problem.denied) {
      await recordVkBroadcastPermission(peerId, false, community.key);
      await db.execute("UPDATE vk_broadcast_deliveries SET status = 'skipped', last_error = ? WHERE id = ?", [problem.message, delivery.id]);
    } else if (!problem.retry) {
      await db.execute(`UPDATE vk_broadcast_runs SET status = 'failed', finished_at = UTC_TIMESTAMP(3), last_error = ?
        WHERE id = ? AND status IN ('queued', 'sending')`, [problem.message, run.id]);
    } else {
      await db.execute(`UPDATE vk_broadcast_deliveries SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`,
        [attempts >= 5 ? 'failed' : 'pending', attempts, retryAt(attempts), problem.message, delivery.id]);
      // Back off the entire run so a VK outage doesn't trigger a request for every recipient.
      await db.execute('UPDATE vk_broadcast_runs SET next_attempt_at = ?, last_error = ? WHERE id = ?', [retryAt(attempts), problem.message, run.id]);
    }
  }
}

async function processCommunity(community: BroadcastCommunity): Promise<void> {
  if (!community.token || !isVkUserId(community.id)) return;
  // The dedicated connection owns this cross-process lock until the network operation finishes.
  const connection = await db.getConnection();
  try {
    const [locks] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [`taxigr_vk_broadcast_worker_${community.key}`]);
    if (!locks[0]?.acquired) return;
    const run = await firstRow<RowDataPacket>(`SELECT id, mode, message_text, image_mime, attachment,
      IF(attachment IS NULL, image_bytes, NULL) AS image_bytes
      FROM vk_broadcast_runs WHERE community_key = ? AND status IN ('queued', 'sending')
      AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP(3)) ORDER BY created_at LIMIT 1`, [community.key]);
    if (run) await deliverRun(community, run);
    else {
      const sync = await firstRow<RowDataPacket>(`SELECT * FROM vk_broadcast_sync WHERE community_key = ? AND status = 'syncing'
        AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP(3))`, [community.key]);
      if (sync) await syncAudience(community, sync);
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [`taxigr_vk_broadcast_worker_${community.key}`]).catch(() => undefined);
    connection.release();
  }
}

export async function processVkBroadcasts(): Promise<void> {
  for (const community of broadcastCommunities()) await processCommunity(community);
}
