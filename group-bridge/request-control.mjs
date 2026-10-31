export function retryAfterMs(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export class Backoff {
  constructor({ base = 15_000, max = 300_000, random = Math.random } = {}) {
    this.base = base; this.max = max; this.random = random; this.failures = 0;
  }
  next() {
    const delay = Math.min(this.max, this.base * 2 ** Math.min(this.failures++, 10));
    return Math.min(this.max, Math.round(delay * (1 + this.random() * 0.25)));
  }
  reset() { this.failures = 0; }
}

// One shared gate for events, health checks and UI actions. New messages and manual
// clicks cannot bypass an outage cooldown or overlap an existing network request.
export class RequestGate {
  constructor({ now = Date.now, random = Math.random, spacing = 1500 } = {}) {
    this.now = now; this.spacing = spacing; this.backoff = new Backoff({ random });
    this.busy = false; this.nextAt = 0; this.blocked = 0; this.requests = 0;
  }
  ready(recovery = false) { return !this.busy && this.now() >= this.nextAt && (!this.blocked || recovery); }
  async run(operation, { recovery = false } = {}) {
    if (!this.ready(recovery)) throw Object.assign(new Error('REQUEST_PAUSED'), { paused: true, retryAfterMs: Math.max(0, this.nextAt - this.now()) });
    this.busy = true; this.requests++;
    try {
      const value = await operation();
      this.backoff.reset(); this.blocked = 0;
      this.nextAt = this.now() + this.spacing;
      return value;
    } catch (error) {
      if (error.status === 401 || error.status === 403) this.blocked = error.status;
      const transient = !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
      const delay = transient ? this.backoff.next() : error.status === 404 ? 300_000 : this.spacing;
      this.nextAt = this.now() + Math.max(this.spacing, delay, error.retryAfterMs || 0);
      throw error;
    } finally { this.busy = false; }
  }
}
