import { relayDelay } from './max-bot-transport';
import type { RelayMessageTransport } from './relay-message-transport';
import { createRelayKeyPair, decodeBytes, decodeRelayJson, decryptRelay, encodeBytes, encryptRelay, parseRelayChunk, splitRelay, type RelayChunk, type RelayRequest, type RelayResponse } from './max-relay-protocol';
import { relayRandomBytes } from './relay-random';
import { RelayReadBatcher } from './relay-read-batcher';

export type BotRelayConfig = { channel: string; publicKey: string };
export class BotRelayClient {
  private readBatchEnabled=false;
  private batchRejected=false;
  private readonly reads=new RelayReadBatcher((request,signal,budget)=>this.requestRaw(request,signal,budget),()=>{this.batchRejected=true;this.readBatchEnabled=false;});
  constructor(private readonly config: BotRelayConfig, private readonly api: RelayMessageTransport) {
    if (decodeBytes(config.publicKey).length !== 32 || !/^[a-zA-Z0-9_-]{1,40}$/.test(config.channel)) throw new Error('MAX_RELAY_INVALID_CONFIG');
  }
  async probe(signal?: AbortSignal): Promise<void> {
    await this.api.verifyRecipient(signal);
    // API availability alone does not prove that messages can be edited or
    // that the taxi worker can reply. Check the complete encrypted round trip.
    const response = await this.requestRaw({ method: 'GET', path: '/v1/transport-health' }, signal, 8000);
    const value = JSON.parse(response.body || '{}') as { data?: { ok?: boolean; capabilities?:{readBatch?:1} } };
    if (response.status !== 200 || value.data?.ok !== true) throw new Error('BOT_RELAY_PROBE_FAILED');
    this.readBatchEnabled=value.data.capabilities?.readBatch === 1;
    if (this.readBatchEnabled) this.batchRejected=false;
  }
  async request(request: Omit<RelayRequest, 'id' | 'expiresAt'>, signal?: AbortSignal, timeoutMs = 60_000): Promise<RelayResponse> {
    return this.readBatchEnabled && this.reads.canBatch(request) ? this.reads.enqueue(request,signal,timeoutMs) : this.requestRaw(request,signal,timeoutMs);
  }
  private async requestRaw(request: Omit<RelayRequest, 'id' | 'expiresAt'>, signal?: AbortSignal, timeoutMs = 60_000): Promise<RelayResponse> {
    const pair = createRelayKeyPair(relayRandomBytes), key = encodeBytes(pair.publicKey), id = encodeBytes(relayRandomBytes(18)).replace(/[+/=]/g, '_');
    const controller = new AbortController(); const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    const deadline = setTimeout(abort, timeoutMs);
    const matches = (chunk: RelayChunk | null): chunk is RelayChunk => !!chunk && chunk.id === id && chunk.key === key && chunk.channel === this.config.channel;
    try {
      const value: RelayRequest = { ...request, id, expiresAt: Date.now() + timeoutMs };
      const encrypted = encryptRelay(value, this.config.publicKey, pair.secretKey, relayRandomBytes);
      const packets = splitRelay(this.config.channel, 'q', id, key, encrypted);
      let firstMid = '';
      for (const packet of packets) { const mid = await this.api.send(packet, controller.signal); firstMid ||= mid; }
      while (!controller.signal.aborted) {
        await relayDelay(850, controller.signal);
        const messages = await this.api.read([firstMid], controller.signal);
        if (controller.signal.aborted) throw new DOMException('Aborted','AbortError');
        const first = parseRelayChunk(messages.find(message => message.body?.mid === firstMid)?.body?.text);
        if (!matches(first) || first.kind === 'q') continue;
        let encoded: string;
        if (first.kind === 'm') {
          const compressed = decodeBytes(first.data);
          if (compressed.length > 3000) throw new Error('MAX_RELAY_INVALID_MANIFEST');
          const mids: unknown = decodeRelayJson(compressed, 20_000);
          if (!Array.isArray(mids) || mids.length !== first.total || !mids.every(mid => typeof mid === 'string' && mid.length < 150)) throw new Error('MAX_RELAY_INVALID_MANIFEST');
          const chunks: RelayChunk[] = [];
          for (let i = 0; i < mids.length; i += 10) {
            for (const message of await this.api.read(mids.slice(i, i + 10), controller.signal)) {
              const chunk = parseRelayChunk(message.body?.text);
              if (matches(chunk) && chunk.kind === 's' && chunk.total === first.total) chunks.push(chunk);
            }
          }
          const unique = new Map(chunks.map(chunk => [chunk.index, chunk]));
          if (unique.size !== first.total) continue;
          encoded = [...unique.values()].sort((a, b) => a.index - b.index).map(chunk => chunk.data).join('');
        } else {
          if (first.total !== 1) continue;
          encoded = first.data;
        }
        const response = decryptRelay<RelayResponse>(encoded, this.config.publicKey, pair.secretKey);
        if (response.id !== id || !Number.isInteger(response.status) || typeof response.body !== 'string') throw new Error('MAX_RELAY_INVALID_RESPONSE');
        if (!this.batchRejected && response.features?.readBatch === 1) this.readBatchEnabled=true;
        return response;
      }
      throw new DOMException('Aborted', 'AbortError');
    } finally { clearTimeout(deadline); signal?.removeEventListener('abort', abort); pair.secretKey.fill(0); }
  }
}
