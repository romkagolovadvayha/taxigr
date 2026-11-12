import { relayDelay } from './max-bot-transport';
import type { RelayMessage, RelayMessageTransport } from './relay-message-transport';
import { RelayTransportUnavailable } from './relay-message-transport';
import { relayRandomBytes } from './relay-random';

export type VkTransportOptions = {
  token: string; groupId: string; serviceUserId: string; gatewayUrl?: string;
  version?: string; fetcher?: typeof fetch;
};
type VkMessage = { id: number; peer_id: number; from_id: number; out: number; date: number; text?: string };

export class VkBotTransport implements RelayMessageTransport {
  private queue: Promise<unknown> = Promise.resolve();
  private nextCallAt = 0;
  private blockedUntil = 0;
  constructor(private readonly options: VkTransportOptions) {
    if (![options.groupId, options.serviceUserId].every(value => /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value)))) {
      throw new Error('VK_RELAY_INVALID_RECIPIENT');
    }
  }
  private async call(method: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
    return this.serial(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (this.blockedUntil > Date.now()) throw new RelayTransportUnavailable('VK_RELAY_FLOOD_CONTROL', this.blockedUntil - Date.now());
        await relayDelay(Math.max(0, this.nextCallAt - Date.now()), signal);
        this.nextCallAt = Date.now() + 80;
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 10_000);
        try {
          const base = this.options.gatewayUrl?.replace(/\/$/, '') ?? 'https://api.vk.ru/method';
          const response = await (this.options.fetcher ?? fetch)(`${base}/${method}`, {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded',
              ...(this.options.gatewayUrl ? {} : { Authorization: `Bearer ${this.options.token}` }) },
            body: new URLSearchParams({ ...params, v: this.options.version ?? '5.199' }).toString(),
          });
          const value = await response.json() as { response?: unknown; error?: { error_code?: number } };
          if (value.error?.error_code === 9) {
            // A per-dialog anti-flood restriction is different from the global
            // request rate. Repeating immediately prolongs it and blocks work.
            this.blockedUntil = Date.now() + 5 * 60_000;
            throw new RelayTransportUnavailable('VK_RELAY_FLOOD_CONTROL', 5 * 60_000);
          }
          if ((response.status === 429 || value.error?.error_code === 6) && attempt < 2) {
            await relayDelay((attempt + 1) * 1000, signal); continue;
          }
          if (!response.ok || value.error || value.response === undefined) throw new Error(`VK_RELAY_HTTP_${value.error?.error_code ?? response.status}`);
          return value.response;
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      }
      throw new Error('VK_RELAY_RATE_LIMIT');
    });
  }
  async verifyRecipient(signal?: AbortSignal): Promise<void> {
    const result = await this.call('messages.isMessagesFromGroupAllowed', {
      group_id: this.options.groupId, user_id: this.options.serviceUserId,
    }, signal);
    if (result.is_allowed !== 1 && result.is_allowed !== true) throw new Error('VK_RELAY_RECIPIENT_NOT_ALLOWED');
  }
  async send(text: string, signal?: AbortSignal): Promise<string> {
    if (text.length > 4000) throw new Error('VK_RELAY_PAYLOAD_TOO_LARGE');
    const bytes = relayRandomBytes(4);
    const randomId = new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0) || 1;
    const id = await this.call('messages.send', { peer_id: this.options.serviceUserId,
      random_id: String(randomId), message: text, dont_parse_links: '1', disable_mentions: '1' }, signal);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('VK_RELAY_INVALID_MESSAGE_ID');
    return String(id);
  }
  async edit(mid: string, text: string): Promise<void> {
    this.validateMids([mid]);
    await this.call('messages.edit', { peer_id: this.options.serviceUserId, message_id: mid,
      message: text, dont_parse_links: '1', disable_mentions: '1' });
  }
  async read(mids: string[], signal?: AbortSignal): Promise<RelayMessage[]> {
    this.validateMids(mids);
    const result = await this.call('messages.getById', { message_ids: mids.join(',') }, signal);
    return this.normalize(result.items ?? []);
  }
  async history(before?: number): Promise<RelayMessage[]> {
    const result = await this.call('messages.getHistory', { peer_id: this.options.serviceUserId, count: '100',
      ...(before === undefined ? {} : { start_message_id: String(before), offset: '1' }) });
    return this.normalize(result.items ?? [], true);
  }
  nextHistoryCursor(batch: RelayMessage[]): number {
    return Number(batch[batch.length - 1]?.body?.mid ?? 0);
  }
  private normalize(messages: VkMessage[], includeIncoming = false): RelayMessage[] {
    const isOwn = (message: VkMessage) => message.from_id === -Number(this.options.groupId) && message.out === 1;
    return messages.filter(message => String(message.peer_id) === this.options.serviceUserId &&
      (includeIncoming || isOwn(message))).map(message => ({
      timestamp: message.date * 1000, recipient: { chat_id: String(message.peer_id) },
      body: { mid: String(message.id), text: isOwn(message) ? message.text : undefined },
    }));
  }
  private validateMids(mids: string[]) {
    if (!mids.length || mids.length > 100 || !mids.every(mid => /^[1-9]\d{0,14}$/.test(mid))) throw new Error('VK_RELAY_INVALID_MESSAGE_ID');
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation); this.queue = next.catch(() => undefined); return next;
  }
}
