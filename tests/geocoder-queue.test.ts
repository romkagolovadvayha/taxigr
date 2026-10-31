import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeocoderQueue, withGeocoderDeadline } from '../server/geocoder-queue';

afterEach(() => vi.unstubAllGlobals());

describe('bounded geocoder queue', () => {
  it('expires a queued search without sending it or allowing later work to bypass an active request', async () => {
    let finish!: () => void;
    const fetch = vi.fn(async (url: string) => {
      if (url === 'first') await new Promise<void>(resolve => { finish = resolve; });
      return new Response('[]');
    });
    vi.stubGlobal('fetch', fetch);
    const request = createGeocoderQueue(0);
    const first = withGeocoderDeadline(signal => request('first', {}, signal), 1_000);
    const expired = withGeocoderDeadline(signal => request('expired', {}, signal), 30);
    await expect(expired).rejects.toThrow('timed out');
    const next = withGeocoderDeadline(signal => request('next', {}, signal), 1_000);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['first']);
    finish();
    await Promise.all([first, next]);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['first', 'next']);
  });

  it('includes a stalled response body in the deadline and releases the queue', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) })
      .mockResolvedValueOnce(new Response('[1]'));
    vi.stubGlobal('fetch', fetch);
    const request = createGeocoderQueue(0);
    await expect(withGeocoderDeadline(signal => request('stalled', {}, signal), 30)).rejects.toThrow('timed out');
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    await expect(withGeocoderDeadline(signal => request('next', {}, signal), 1_000)).resolves.toEqual([1]);
  });

  it('spaces requests and preserves the same signal through every fallback', async () => {
    const starts: number[] = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, { signal }: RequestInit) => {
      starts.push(Date.now());
      signals.push(signal!);
      return new Response('[]');
    }));
    const request = createGeocoderQueue(40);
    await withGeocoderDeadline(async signal => {
      await request('scoped', {}, signal);
      await request('fallback', {}, signal);
    }, 1_000);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(35);
    expect(signals[0]).toBe(signals[1]);
  });
});
