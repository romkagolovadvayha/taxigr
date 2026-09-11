export type CachePolicy = {
  ttlMs: number;
  tag: string;
  persist?: boolean;
  accept?: (value: unknown) => boolean;
};
type Entry = { value: unknown; expiresAt: number; tag: string; persist: boolean; size: number };
type Pending = { promise: Promise<unknown>; controller: AbortController; users: number; tag: string };
type Storage = { read: () => Promise<string | null>; write: (value: string) => Promise<void> };

// Disk limits use UTF-8 bytes; memory limits use UTF-16 code units below.
function utf8Size(value: string): number {
  let size = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return size;
}

function aborted(): Error {
  return Object.assign(new Error('Запрос отменён'), { name: 'AbortError' });
}

/** Bounded, account-scoped response storage with independent request cancellation. */
export class ResponseCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Pending>();
  private versions = new Map<string, number>();
  private generation = 0;
  private hydration?: Promise<void>;
  private writeTimer?: ReturnType<typeof setTimeout>;
  private writes = Promise.resolve();
  private bytes = 0;

  constructor(private storage?: Storage, private maxEntries = 160, private maxBytes = 2_000_000) {}

  private async hydrate() {
    if (!this.storage) return;
    this.hydration ??= (async () => {
      const generation = this.generation;
      try {
        const raw = await this.storage!.read();
        if (!raw || raw.length > 512_000 || utf8Size(raw) > 512_000 || generation !== this.generation) return;
        const saved = JSON.parse(raw) as { version: number; entries: [string, Entry][] };
        if (saved.version !== 1 || !Array.isArray(saved.entries)) return;
        for (const [key, entry] of saved.entries.slice(-64)) {
          if (typeof key !== 'string' || entry?.tag !== 'addresses' || !entry.persist ||
              !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now() || !Array.isArray(entry.value)) continue;
          if (!this.entries.has(key) && !(this.versions.get(entry.tag) ?? 0)) {
            this.put(key, { ...entry, size: JSON.stringify(entry.value).length * 2 });
          }
        }
      } catch { /* A discarded or damaged cache is always replaceable. */ }
    })();
    await this.hydration;
  }

  private put(key: string, entry: Entry) {
    if (entry.size > this.maxBytes / 2) return;
    this.remove(key);
    this.entries.set(key, entry);
    this.bytes += entry.size;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      this.remove(this.entries.keys().next().value!);
    }
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.size;
    this.entries.delete(key);
  }

  private scheduleWrite() {
    if (!this.storage || this.writeTimer) return;
    this.writeTimer = setTimeout(() => { this.writeTimer = undefined; void this.flush(); }, 300);
  }

  async flush() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    if (!this.storage) return;
    const entries: [string, Entry][] = [];
    let size = 0;
    for (const item of [...this.entries].reverse()) {
      if (!item[1].persist || item[1].expiresAt <= Date.now()) continue;
      const bytes = utf8Size(JSON.stringify(item)) + 1;
      if (entries.length >= 64 || size + bytes > 500_000) continue;
      size += bytes;
      entries.unshift(item);
    }
    const raw = JSON.stringify({ version: 1, entries });
    this.writes = this.writes.then(() => this.storage!.write(raw)).catch(() => undefined);
    await this.writes;
  }

  invalidate(tags?: readonly string[]) {
    const matches = (tag: string) => !tags || tags.includes(tag);
    if (!tags) {
      this.generation += 1;
      this.hydration = Promise.resolve();
    }
    for (const [key, entry] of this.entries) if (matches(entry.tag)) this.remove(key);
    for (const [key, pending] of this.pending) if (matches(pending.tag)) this.pending.delete(key);
    for (const tag of tags ?? [...this.versions.keys()]) this.versions.set(tag, (this.versions.get(tag) ?? 0) + 1);
    this.scheduleWrite();
  }

  async read<T>(key: string, policy: CachePolicy, request: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal | null, refresh = false): Promise<T> {
    if (signal?.aborted) throw aborted();
    const generation = this.generation;
    const tagVersion = this.versions.get(policy.tag) ?? 0;
    if (policy.persist) await this.hydrate();
    if (signal?.aborted || generation !== this.generation || tagVersion !== (this.versions.get(policy.tag) ?? 0)) throw aborted();
    const cached = this.entries.get(key);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      this.entries.delete(key); this.entries.set(key, cached);
      return cached.value as T;
    }
    if (cached?.expiresAt && cached.expiresAt <= Date.now()) this.remove(key);

    let pending = this.pending.get(key);
    if (!pending || pending.controller.signal.aborted) {
      const controller = new AbortController();
      const version = this.versions.get(policy.tag) ?? 0;
      this.versions.set(policy.tag, version);
      const task: Pending = { controller, users: 0, tag: policy.tag, promise: Promise.resolve() };
      task.promise = Promise.resolve().then(() => request(controller.signal)).then(value => {
        if (!controller.signal.aborted && version === this.versions.get(policy.tag) &&
            policy.ttlMs > 0 && (!policy.accept || policy.accept(value))) {
          this.put(key, { value, tag: policy.tag, persist: Boolean(policy.persist),
            expiresAt: Date.now() + policy.ttlMs, size: (JSON.stringify(value)?.length ?? 0) * 2 });
          if (policy.persist) this.scheduleWrite();
        }
        return value;
      }).finally(() => { if (this.pending.get(key) === task) this.pending.delete(key); });
      this.pending.set(key, task);
      pending = task;
    }
    const task = pending;
    task.users += 1;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (error: unknown, value?: T) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', cancel);
        task.users -= 1;
        if (task.users === 0 && this.pending.get(key) === task) {
          this.pending.delete(key);
          task.controller.abort();
        }
        if (error) reject(error); else resolve(value as T);
      };
      const cancel = () => finish(aborted());
      signal?.addEventListener('abort', cancel, { once: true });
      task.promise.then(value => finish(null, value as T), error => finish(error));
      if (signal?.aborted) cancel();
    });
  }
}
