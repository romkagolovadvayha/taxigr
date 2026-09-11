import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseCache } from '../src/api/response-cache';
import { mutationCacheTags, responseCachePolicy } from '../src/api/cache-policy';

const policy = { ttlMs: 1_000, tag: 'profile' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => vi.useRealTimers());

describe('client response cache', () => {
  it('reuses reads, separates accounts and expires entries', async () => {
    vi.useFakeTimers();
    const cache = new ResponseCache();
    const load = vi.fn(async () => ({ name: 'Пассажир' }));
    await cache.read('alice:profile', policy, load);
    await cache.read('alice:profile', policy, load);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.read('bob:profile', policy, load);
    await vi.advanceTimersByTimeAsync(1_001);
    await cache.read('alice:profile', policy, load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('shares an in-flight read without one screen aborting another screen', async () => {
    const cache = new ResponseCache();
    const pending = deferred<string>();
    const load = vi.fn((_signal: AbortSignal) => pending.promise);
    const first = new AbortController();
    const a = cache.read('shared', policy, load, first.signal);
    const b = cache.read('shared', policy, load);
    first.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve('result');
    expect(await b).toBe('result');
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]![0].aborted).toBe(false);
  });

  it('aborts abandoned reads and does not save their late responses', async () => {
    const cache = new ResponseCache();
    const pending = deferred<string>();
    const controller = new AbortController();
    const load = vi.fn((_signal: AbortSignal) => pending.promise);
    const request = cache.read('cancelled', policy, load, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(load.mock.calls[0]![0].aborted).toBe(true);
    pending.resolve('old');
    await Promise.resolve();
    expect(await cache.read('cancelled', policy, async () => 'new')).toBe('new');
  });

  it('invalidates after a mutation and rejects repopulation by an older read', async () => {
    const cache = new ResponseCache();
    const old = deferred<string>();
    const request = cache.read('profile', policy, () => old.promise);
    cache.invalidate(['profile']);
    old.resolve('old');
    await request;
    const load = vi.fn(async () => 'new');
    expect(await cache.read('profile', policy, load)).toBe('new');
    expect(load).toHaveBeenCalledOnce();
  });

  it('does not cache failures and supports explicit refresh', async () => {
    const cache = new ResponseCache();
    await expect(cache.read('key', policy, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(await cache.read('key', policy, async () => 'first')).toBe('first');
    expect(await cache.read('key', policy, async () => 'second', undefined, true)).toBe('second');
  });

  it('bounds memory and evicts the least recently used entry', async () => {
    const cache = new ResponseCache(undefined, 2);
    await cache.read('a', policy, async () => 'a');
    await cache.read('b', policy, async () => 'b');
    await cache.read('a', policy, async () => 'wrong');
    await cache.read('c', policy, async () => 'c');
    expect(await cache.read('b', policy, async () => 'new b')).toBe('new b');
    const huge = new ResponseCache(undefined, 2, 20);
    const load = vi.fn(async () => 'a'.repeat(30));
    await huge.read('huge', policy, load); await huge.read('huge', policy, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('restores address results across launches, never private profile/history responses', async () => {
    let disk: string | null = null;
    const storage = { read: async () => disk, write: async (value: string) => { disk = value; } };
    const cache = new ResponseCache(storage);
    const addressPolicy = responseCachePolicy('/v1/addresses/search?query=Грахово');
    const addresses = [{ label: 'с. Грахово' }];
    await cache.read('account:address', addressPolicy, async () => addresses);
    await cache.read('account:profile', policy, async () => ({ phone: 'private-profile' }));
    await cache.flush();
    expect(disk).not.toContain('private-profile');
    const restarted = new ResponseCache(storage);
    const load = vi.fn(async () => []);
    expect(await restarted.read('account:address', addressPolicy, load)).toEqual(addresses);
    expect(load).not.toHaveBeenCalled();
    restarted.invalidate(); await restarted.flush();
    expect(JSON.parse(disk!).entries).toEqual([]);
  });

  it('does not cache current orders, bootstrap, quote or chat as historical data', () => {
    for (const path of ['/v1/bootstrap', '/v1/orders/quote', '/v1/orders/abc/messages', '/v1/driver/offers']) {
      const rule = responseCachePolicy(path);
      expect(rule.ttlMs === 0 || rule.accept?.({ status: 'in_progress' }) === false).toBe(true);
    }
    const detail = responseCachePolicy('/v1/orders/abc');
    expect(detail.accept?.({ status: 'completed' })).toBe(true);
    expect(detail.accept?.({ status: 'accepted' })).toBe(false);
    expect(mutationCacheTags('/v1/driver/location')).toEqual([]);
    expect(mutationCacheTags('/v1/orders/abc/cancel')).toContain('orders');
    expect(mutationCacheTags('/v1/driver/orders/abc/complete')).toContain('orders');
    expect(mutationCacheTags('/v1/addresses/points')).toContain('addresses');
  });

  it('bounds persisted Cyrillic by bytes and ignores disk reads that finish after logout', async () => {
    let disk: string | null = null;
    const storage = { read: async () => disk, write: async (value: string) => { disk = value; } };
    const cache = new ResponseCache(storage);
    const addressPolicy = responseCachePolicy('/v1/addresses/search?kind=house');
    for (let index = 0; index < 4; index++) {
      await cache.read(`address:${index}`, addressPolicy, async () => [{ label: 'Г'.repeat(80_000) }]);
    }
    await cache.flush();
    expect(Buffer.byteLength(disk!, 'utf8')).toBeLessThanOrEqual(512_000);
    const pending = deferred<string | null>();
    const restarted = new ResponseCache({ ...storage, read: () => pending.promise });
    const read = restarted.read('address:3', addressPolicy, async () => []);
    restarted.invalidate();
    pending.resolve(disk);
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(await restarted.read('address:3', addressPolicy, async () => ['new account'])).toEqual(['new account']);
    await restarted.flush();
  });

  it('keeps address hydration usable when an unrelated live order invalidates its cache', async () => {
    const pending = deferred<string | null>();
    const cache = new ResponseCache({ read: () => pending.promise, write: async () => {} });
    const read = cache.read('addresses', responseCachePolicy('/v1/addresses/search'), async () => ['street']);
    cache.invalidate(['orders', 'profile']);
    pending.resolve(null);
    expect(await read).toEqual(['street']);
    await cache.flush();
  });
});
