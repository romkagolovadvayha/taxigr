import type { RelayMessage, RelayMessageTransport } from './relay-message-transport';
import { maxTransportFetch } from './max-transport-fetch';
export type MaxMessage = RelayMessage;
export type MaxTransportOptions = { token: string; chatId: string; serviceUserId: string; gatewayUrl?: string; fetcher?: typeof fetch };

export class MaxBotTransport implements RelayMessageTransport {
  private nextSendAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: MaxTransportOptions) {
    if (!/^-?\d{1,20}$/.test(options.chatId) || !/^\d{1,20}$/.test(options.serviceUserId)) throw new Error('MAX_RELAY_INVALID_RECIPIENT');
  }
  private async call(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Record<string, any>> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const base = this.options.gatewayUrl?.replace(/\/$/, '') ?? 'https://platform-api2.max.ru';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 10_000);
      try {
        const response = await (this.options.fetcher ?? maxTransportFetch)(`${base}/${path}`, { method, headers: {
          ...(this.options.gatewayUrl ? {} : { Authorization: this.options.token }),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
        if (response.status === 429 && attempt < 2) { await relayDelay((attempt + 1) * 1000, signal); continue; }
        const result = await response.json() as Record<string, any>;
        if (!response.ok || result.success === false) throw new Error(`MAX_RELAY_HTTP_${response.status}`);
        return result;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
    throw new Error('MAX_RELAY_RATE_LIMIT');
  }
  async verifyRecipient(signal?: AbortSignal): Promise<void> {
    const chat = await this.call(`chats/${encodeURIComponent(this.options.chatId)}`, 'GET', undefined, signal);
    if (chat.type !== 'dialog' || String(chat.dialog_with_user?.user_id) !== this.options.serviceUserId) throw new Error('MAX_RELAY_RECIPIENT_MISMATCH');
  }
  async send(text: string, signal?: AbortSignal): Promise<string> {
    if (text.length > 4000) throw new Error('MAX_RELAY_PAYLOAD_TOO_LARGE');
    return this.serial(async () => {
      await relayDelay(Math.max(0, this.nextSendAt - Date.now()), signal);
      this.nextSendAt = Date.now() + 600;
      const result = await this.call(`messages?chat_id=${encodeURIComponent(this.options.chatId)}`, 'POST', { text, notify: false }, signal);
      const message = (result.message ?? result) as MaxMessage;
      if (String(message.recipient?.chat_id) !== this.options.chatId || !message.body?.mid) throw new Error('MAX_RELAY_RECIPIENT_MISMATCH');
      return message.body.mid;
    });
  }
  async edit(mid: string, text: string): Promise<void> {
    await this.serial(async () => {
      await relayDelay(Math.max(0, this.nextSendAt - Date.now())); this.nextSendAt = Date.now() + 600;
      await this.call(`messages?message_id=${encodeURIComponent(mid)}`, 'PUT', { text, notify: false });
    });
  }
  async read(mids: string[], signal?: AbortSignal): Promise<MaxMessage[]> {
    const result = await this.call(`messages?message_ids=${encodeURIComponent(mids.join(','))}`, 'GET', undefined, signal);
    return (result.messages ?? []) as MaxMessage[];
  }
  async history(before?: number): Promise<MaxMessage[]> {
    const result = await this.call(`messages?chat_id=${encodeURIComponent(this.options.chatId)}&count=100${before === undefined ? '' : `&from=${before}`}`);
    return (result.messages ?? []) as MaxMessage[];
  }
  async remove(mid: string): Promise<void> { await this.call(`messages?message_id=${encodeURIComponent(mid)}`, 'DELETE'); }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation); this.queue = next.catch(() => undefined); return next;
  }
}
export function relayDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
  });
}
