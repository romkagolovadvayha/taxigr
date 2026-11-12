import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from './db';
import { authenticate } from './security';
import { readBatchPath } from '../src/api/read-batch-contract';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Replay = RowDataPacket & { fingerprint: string; status_code: number | null; response_body: string | null };
export async function pruneTransportReplays(): Promise<void> {
  await db.execute('DELETE FROM transport_request_replays WHERE created_at < UTC_TIMESTAMP() - INTERVAL 2 DAY');
}
export function registerTransportIdempotency(app: FastifyInstance): void {
  const claimed = new WeakMap<FastifyRequest, string>();
  app.addHook('preHandler', async (request, reply) => {
    // These POSTs only read data. Replaying a saved price or batch would return
    // stale data and add two unnecessary database writes per calculation/read.
    if (request.routeOptions.url === readBatchPath || request.routeOptions.url === '/v1/quotes') return;
    const id = request.headers['x-taxi-request-id'];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(id) || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const key = hash(`${request.headers.authorization ?? 'anonymous'}\n${id}`);
    const fingerprint = hash(`${request.method}\n${request.url}\n${JSON.stringify(request.body ?? {})}`);
    const [insert] = await db.execute<import('mysql2/promise').ResultSetHeader>(
      'INSERT IGNORE INTO transport_request_replays (request_key, fingerprint) VALUES (?, ?)', [key, fingerprint]);
    if (insert.affectedRows) { claimed.set(request, key); return; }
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const [rows] = await db.query<Replay[]>('SELECT fingerprint, status_code, response_body FROM transport_request_replays WHERE request_key = ?', [key]);
      const row = rows[0];
      if (!row || row.fingerprint !== fingerprint) throw Object.assign(new Error('Идентификатор запроса уже использован для другого действия'), { statusCode: 409, code: 'REQUEST_ID_CONFLICT' });
      if (row.status_code !== null && row.response_body !== null) {
        // A stored response must not extend a revoked or expired session.
        if (request.headers.authorization) await authenticate(request);
        return reply.code(row.status_code).header('Content-Type', 'application/json').send(row.response_body);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Object.assign(new Error('Действие ещё выполняется. Обновите данные перед повтором.'), { statusCode: 409, code: 'REQUEST_IN_PROGRESS' });
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const key = claimed.get(request);
    if (!key) return payload;
    claimed.delete(request);
    const body = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : null;
    if (body !== null) await db.execute('UPDATE transport_request_replays SET status_code = ?, response_body = ? WHERE request_key = ?', [reply.statusCode, body, key]);
    return payload;
  });
}
