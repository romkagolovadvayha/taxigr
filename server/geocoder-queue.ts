import { setTimeout as delay } from 'node:timers/promises';

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void task.then(value => {
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

/** One deadline includes queueing, all fallbacks and reading response bodies. */
export async function withGeocoderDeadline<T>(load: (signal: AbortSignal) => Promise<T>, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Geocoder search timed out')), timeoutMs);
  try {
    return await abortable(load(controller.signal), controller.signal);
  } finally { clearTimeout(timer); }
}

/** Preserve the upstream limit; expired queued requests never reach the server. */
export function createGeocoderQueue(intervalMs = 1_050) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStartedAt = -Infinity;
  return (url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> => {
    const task = queue.then(async () => {
      signal.throwIfAborted();
      const waitMs = Math.max(0, intervalMs - (Date.now() - lastStartedAt));
      if (waitMs) await delay(waitMs, undefined, { signal });
      signal.throwIfAborted();
      lastStartedAt = Date.now();
      return abortable((async () => {
        const response = await fetch(url, { headers, signal });
        if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
        return response.json() as Promise<unknown>;
      })(), signal);
    });
    // Even a stuck upstream must release the queue when its deadline expires.
    queue = task.catch(() => undefined);
    return abortable(task, signal);
  };
}
