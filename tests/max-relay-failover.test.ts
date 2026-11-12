import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const relay = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api/max-relay-config', () => ({ getMaxRelayClient: () => relay }));

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://taxi.test');
  relay.request.mockReset().mockResolvedValue({ status: 200, body: '{"data":{"id":"same-order"}}' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('primary API and MAX failover', () => {
  it('uses the primary server whenever it responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":{"id":"primary"}}')));
    const { apiRequest } = await import('../src/api/client');
    expect(await apiRequest('/v1/orders', { method: 'POST', body: '{}' })).toEqual({ id: 'primary' });
    expect(relay.request).not.toHaveBeenCalled();
  });

  it('preserves the user, body and operation ID after a lost primary response', async () => {
    const primary = vi.fn().mockRejectedValue(new TypeError('network unavailable'));
    vi.stubGlobal('fetch', primary);
    const { apiRequest } = await import('../src/api/client');
    await apiRequest('/v1/orders', { method: 'POST', token: 'passenger', body: '{"pickup":"test"}' });
    const sent = primary.mock.calls[0]![1];
    expect(relay.request.mock.calls[0]![0]).toEqual({ method: 'POST', path: '/v1/orders', token: 'passenger', body: sent.body, requestId: sent.headers['X-Taxi-Request-Id'] });
    expect(sent.headers['X-Taxi-Request-Id']).toMatch(/^[a-f0-9]{48}$/);
    expect((await import('../src/api/api-channel')).getApiChannel()).toBe('max');
  });

  it.each([401, 403, 429, 502, 503, 504])('does not route a primary rejection (%s) through MAX', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"code":"DENIED"}}', { status })));
    const { apiRequest } = await import('../src/api/client');
    await expect(apiRequest('/v1/orders', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status });
    expect(relay.request).not.toHaveBeenCalled();
  });

  it('does not send a cancelled operation through MAX', async () => {
    const abort = new AbortController(); abort.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    const { apiRequest } = await import('../src/api/client');
    await expect(apiRequest('/v1/orders', { method: 'POST', signal: abort.signal })).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(relay.request).not.toHaveBeenCalled();
  });

  it('automatically probes and restores the primary server', async () => {
    vi.useFakeTimers();
    const primary = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(new Response('{"data":{"ready":true}}'));
    vi.stubGlobal('fetch', primary);
    const { apiRequest } = await import('../src/api/client');
    await apiRequest('/v1/quotes', { method: 'POST', body: '{}' });
    await apiRequest('/v1/quotes', { method: 'POST', body: '{}' });
    expect(primary).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await apiRequest('/v1/quotes', { method: 'POST', body: '{}' })).toEqual({ ready: true });
    expect((await import('../src/api/api-channel')).getApiChannel()).toBe('primary');
  });
});
