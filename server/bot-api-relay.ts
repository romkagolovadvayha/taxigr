import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RelayMessageTransport } from '../src/api/relay-message-transport';
import { RelayTransportUnavailable } from '../src/api/relay-message-transport';
import { decodeBytes, decryptRelay, encodeBytes, encryptRelay, formatRelayChunk, parseRelayChunk, relayMaxChunks, relayMaxPlainBytes, splitRelay, type RelayChunk, type RelayRequest, type RelayResponse } from '../src/api/max-relay-protocol';
import { readBatchPath } from '../src/api/read-batch-contract';
import { gzipSync, strToU8 } from 'fflate';
import { relayClientAddress } from './relay-client-address';

type Options = { api: RelayMessageTransport; recipientId: string; label: 'MAX' | 'VK'; channel: string; secretKey: string };
type Pending = { chunks: Map<number, RelayChunk>; mids: Map<number, string>; total: number; createdAt: number; deliveryFailures: number; response?:RelayResponse; delivery?:{packets:string[];mids:string[]} };
export async function startBotApiRelay(app: FastifyInstance, options: Options): Promise<() => Promise<void>> {
  const api = options.api;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(options.channel)) throw new Error('MAX_RELAY_INVALID_CHANNEL');
  const secret = decodeBytes(options.secretKey);
  if (secret.length !== 32) throw new Error('MAX_RELAY_INVALID_KEY');
  const pending = new Map<string, Pending>(), completed = new Set<string>();
  let quietTicks = 0;
  let failures = 0;
  let stopped = false, verified = false, timer: ReturnType<typeof setTimeout> | undefined, work: Promise<void> | undefined;
  async function respond(chunk: RelayChunk, mid: string, response: RelayResponse, group:Pending) {
    if (!group.delivery) {
      if (app.hasRoute?.({method:'POST',url:readBatchPath})) response={...response,features:{readBatch:1}};
      const encrypted = encryptRelay(response, chunk.key, secret, size => randomBytes(size));
      group.delivery={packets:splitRelay(options.channel, 's', chunk.id, chunk.key, encrypted),mids:[]};
    }
    const {packets,mids}=group.delivery;
    if (packets.length === 1) { await api.edit(mid, packets[0]!); return; }
    // A failed manifest edit must not resend every already uploaded fragment.
    for (let index=mids.length;index<packets.length;index++) mids.push(await api.send(packets[index]!));
    const manifest = formatRelayChunk({ ...chunk, kind: 'm', index: 0, total: packets.length, data: encodeBytes(gzipSync(strToU8(JSON.stringify(mids)))) });
    if (manifest.length > 4000) throw new Error('MAX_RELAY_MANIFEST_TOO_LARGE');
    await api.edit(mid, manifest);
  }
  async function tick() {
    let activity = false;
    // A temporary MAX outage during API startup must not stop the primary API.
    // Never send anything until this fixed private recipient is verified.
    if (!verified) { await api.verifyRecipient(); verified = true; }
    const messages = [];
    let before: number | undefined;
    // A response burst or one fragmented upload can exceed MAX's 100-message
    // page. Read the whole request lifetime, with a bounded catch-up budget.
    for (let page = 0; page < 10 && !stopped; page += 1) {
      const batch = await api.history(before);
      messages.push(...batch);
      const oldest = Math.min(...batch.map(message => message.timestamp ?? 0));
      const next = api.nextHistoryCursor?.(batch) ?? oldest - 1;
      if (batch.length < 100 || oldest < Date.now() - 130_000 || !Number.isFinite(next) || (before !== undefined && next >= before)) break;
      before = next;
    }
    for (const message of messages.reverse()) {
      if (stopped) break;
      if (String(message.recipient?.chat_id) !== options.recipientId) continue;
      if (message.timestamp !== undefined && message.timestamp < Date.now() - 130_000) continue;
      const chunk = parseRelayChunk(message.body?.text), mid = message.body?.mid;
      if (!chunk || !mid || chunk.kind !== 'q' || chunk.channel !== options.channel) continue;
      const groupKey = `${chunk.key}:${chunk.id}`;
      if (completed.has(groupKey)) continue;
      let group = pending.get(groupKey);
      if (!group) {
        if (pending.size >= 100) continue;
        group = { chunks: new Map(), mids: new Map(), total: chunk.total, createdAt: Date.now(), deliveryFailures: 0 }; pending.set(groupKey, group);
        activity = true;
      }
      if (group.total !== chunk.total || chunk.total > relayMaxChunks) continue;
      group.chunks.set(chunk.index, chunk); group.mids.set(chunk.index, mid);
    }
    for (const [groupKey, group] of pending) {
      if (stopped) break;
      if (Date.now() - group.createdAt > 120_000) { pending.delete(groupKey); continue; }
      if (group.chunks.size !== group.total) continue;
      const first = group.chunks.get(0)!, mid = group.mids.get(0)!;
      let request: RelayRequest;
      try {
        request = decryptRelay<RelayRequest>([...group.chunks.values()].sort((a,b) => a.index-b.index).map(value => value.data).join(''), first.key, secret);
      } catch { pending.delete(groupKey); completed.add(groupKey); continue; }
      if (!group.response) {try {
        if (request.id !== first.id || !Number.isFinite(request.expiresAt) || request.expiresAt < Date.now() || request.expiresAt > Date.now() + 125_000) throw Object.assign(new Error('Запрос устарел. Обновите данные.'), { status: 408, code: 'MAX_RELAY_EXPIRED' });
        const target = new URL(request.path, 'https://relay.invalid');
        const decodedPath=decodeURIComponent(target.pathname);
        if (typeof request.path !== 'string' || request.path.length > 4096 || target.hash || target.origin !== 'https://relay.invalid' || !decodedPath.startsWith('/v1/') || /^\/v1\/(webhooks|internal)(\/|$)/.test(decodedPath) || !['GET','POST','PUT','PATCH','DELETE'].includes(request.method)) throw Object.assign(new Error('Недопустимый адрес запроса'), { status: 400, code: 'MAX_RELAY_PATH_DENIED' });
        if (request.token !== undefined && (typeof request.token !== 'string' || request.token.length > 16_384) || request.body !== undefined && typeof request.body !== 'string' ||
            request.requestId !== undefined && (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(request.requestId))) throw Object.assign(new Error('Некорректный пакет запроса'),{status:400,code:'RELAY_REQUEST_INVALID'});
        const replayId=request.requestId ?? `relay-${createHash('sha256').update(`${first.key}:${first.id}`).digest('hex').slice(0,48)}`;
        const injected = await app.inject({ method: request.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: target.pathname + target.search,
          remoteAddress: await relayClientAddress(request.token),
          headers: { ...(request.token ? { authorization: `Bearer ${request.token}` } : {}), ...(!['GET','HEAD'].includes(request.method) ? { 'x-taxi-request-id': replayId } : {}),
            ...(request.body === undefined ? {} : { 'content-type': 'application/json' }) }, payload: request.body });
        group.response = { id: first.id, status: injected.statusCode, body: injected.body };
      } catch (error) {
        const value = error as { status?: number; code?: string };
        group.response = { id: first.id, status: value.status ?? 500, body: JSON.stringify({ error: { code: value.code ?? 'MAX_RELAY_ERROR', message: error instanceof Error ? error.message : 'Ошибка резервного канала' } }) };
      }
      if (Buffer.byteLength(JSON.stringify(group.response)) > relayMaxPlainBytes-100) group.response={id:first.id,status:413,body:'{"error":{"code":"RELAY_RESPONSE_TOO_LARGE","message":"Ответ слишком большой для резервного канала"}}'};
      }
      try { await respond(first, mid, group.response, group); completed.add(groupKey); pending.delete(groupKey); activity=true; }
      catch (error) {
        if (error instanceof RelayTransportUnavailable) throw error;
        if (++group.deliveryFailures >= 3) { completed.add(groupKey); pending.delete(groupKey); }
        const code = error instanceof Error && /^(?:VK|MAX|BOT)_RELAY_[A-Z0-9_]+$/.test(error.message) ? error.message : 'RELAY_DELIVERY_ERROR';
        app.log.warn({ code }, `${options.label} relay response delivery failed`);
      }
    }
    if (completed.size > 5000) completed.clear();
    quietTicks = activity || pending.size ? 0 : quietTicks+1;
  }
  const loop = () => {
    if (stopped) return;
    let retryAfterMs = 1000;
    work = tick().then(()=>{failures=0;retryAfterMs=Math.min(4000,1000+quietTicks*1000);}).catch(error => {
      failures++;
      retryAfterMs=Math.min(60_000,2000*2**Math.min(failures,5));
      if (error instanceof RelayTransportUnavailable) retryAfterMs = Math.min(15 * 60_000, Math.max(1000, error.retryAfterMs));
      app.log.warn({ retryAfterMs }, `${options.label} relay is waiting before reconnecting`);
    }).finally(() => {
      work = undefined; if (!stopped) { timer = setTimeout(loop, retryAfterMs); timer.unref(); }
    });
  };
  loop();
  return async () => { stopped = true; clearTimeout(timer); await work; secret.fill(0); };
}
