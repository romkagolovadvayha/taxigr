import type { RelayRequest, RelayResponse } from './max-relay-protocol';
import { getApiChannel, setApiChannel } from './api-channel';
import { RelayTransportUnavailable } from './relay-message-transport';

export type ReserveName = 'vk' | 'max';
export type ReserveClient = { name: ReserveName; client: {
  probe(signal?: AbortSignal): Promise<void>;
  request(request: Omit<RelayRequest, 'id' | 'expiresAt'>, signal?: AbortSignal, timeoutMs?: number): Promise<RelayResponse>;
} };
const aborted = () => new DOMException('Aborted', 'AbortError');

function waitForSelection<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(aborted());
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export class ReserveCoordinator {
  private preferred?: ReserveName;
  private selectedAt = 0;
  private selection?: Promise<ReserveName>;
  private readonly failedUntil = new Map<ReserveName, number>();
  constructor(private readonly getClients: () => ReserveClient[], private readonly now = Date.now) {}

  private async choose(clients: ReserveClient[], signal?: AbortSignal): Promise<ReserveName> {
    const eligible = clients.filter(value => (this.failedUntil.get(value.name) ?? 0) <= this.now());
    if (!eligible.length) throw new RelayTransportUnavailable('RESERVE_COOLDOWN',Math.max(1,Math.min(...clients.map(value=>(this.failedUntil.get(value.name) ?? this.now())-this.now()))));
    const candidates = eligible;
    if (candidates.length === 1) return candidates[0]!.name;
    if (this.preferred && this.now() - this.selectedAt < 60_000 && candidates.some(value => value.name === this.preferred)) return this.preferred;
    if (!this.selection) {
      let selected = false;
      const controllers = candidates.map(() => new AbortController());
      const timer = setTimeout(() => controllers.forEach(controller => controller.abort()), 8000);
      this.selection = Promise.any(candidates.map(async (value, index) => {
        const signal = controllers[index]!.signal;
        try { await waitForSelection(value.client.probe(signal), signal); return value.name; }
        catch (error) {
          if (selected && signal.aborted) throw error;
          if (error instanceof RelayTransportUnavailable) this.failedUntil.set(value.name, this.now() + error.retryAfterMs);
          else this.failedUntil.set(value.name,this.now()+30_000);
          throw error;
        }
      })).then(name => { selected=true; this.preferred = name; this.selectedAt = this.now(); return name; }).finally(() => {
        clearTimeout(timer); controllers.forEach(controller => controller.abort()); this.selection = undefined;
      });
    }
    return waitForSelection(this.selection, signal);
  }

  async request(request: Omit<RelayRequest, 'id' | 'expiresAt'>, signal?: AbortSignal, timeoutMs = 60_000): Promise<RelayResponse> {
    if (signal?.aborted) throw aborted();
    const clients = this.getClients();
    if (!clients.length) throw new Error('RESERVE_NOT_CONFIGURED');
    const chosen = await this.choose(clients, signal);
    const candidates = clients.filter(value => (this.failedUntil.get(value.name) ?? 0) <= this.now())
      .sort((a, b) => Number(b.name === chosen) - Number(a.name === chosen));
    const started = this.now();
    let failure: unknown = new Error('RESERVE_UNAVAILABLE');
    for (let index = 0; index < candidates.length; index += 1) {
      if (signal?.aborted) throw aborted();
      const candidate = candidates[index]!;
      const remaining = Math.max(1, timeoutMs - (this.now() - started));
      const large = (request.body?.length ?? 0) > 64_000;
      // Cold admin screens load many reads at once. Give their queued replies
      // time to arrive instead of declaring a healthy, throttled worker dead.
      const firstBudget = request.method === 'GET' ? 20_000 : 8000;
      const budget = clients.length === 1 ? remaining : Math.min(remaining,
        large ? (index === 0 ? 60_000 : 120_000) : index === 0 ? firstBudget : 30_000);
      try {
        if (getApiChannel() !== candidate.name) setApiChannel(candidate.name);
        // An application response (including 401/403/429) is final. Only a
        // transport failure retries the same operation through another channel.
        const response = await candidate.client.request(request, signal, budget);
        this.preferred = candidate.name; this.failedUntil.delete(candidate.name);
        this.selectedAt = this.now();
        return response;
      } catch (error) {
        if (signal?.aborted) throw aborted();
        failure = error; this.failedUntil.set(candidate.name, this.now() +
          (error instanceof RelayTransportUnavailable ? error.retryAfterMs : 30_000));
        if (this.preferred === candidate.name) this.preferred = undefined;
      }
    }
    throw failure;
  }
}
