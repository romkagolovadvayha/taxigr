import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('startup recovery after a short API outage', () => {
  const success = () => ({ ok: true, status: 200, json: async () => ({ data: { ready: true } }) });
  const unavailable = () => ({ ok: false, status: 502, json: async () => ({}) });

  it('shares a bootstrap retry after a failed CORS preflight', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    const first = apiRequest('/v1/bootstrap', { token: 'same-session' });
    const second = apiRequest('/v1/bootstrap', { token: 'same-session' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await first).toEqual({ ready: true });
    expect(await second).toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers the session after a restarting upstream returns 502', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    const result = apiRequest('/v1/auth/refresh', { method: 'POST', token: 'session' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['GET', '/v1/push/config'],
    ['PUT', '/v1/web-push-subscriptions'],
  ])('recovers %s %s after a dropped connection without immediate alerting', async (method, path) => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Load failed')).mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    const {apiRequest} = await import('../src/api/client');
    const result = apiRequest(path, {method, token:'session', body:method === 'PUT' ? '{"endpoint":"test"}' : undefined});
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toEqual({ready:true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].body).toBe(fetchMock.mock.calls[1]![1].body);
  });

  it('reports a persistent push registration outage after two retries', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue(unavailable());
    vi.stubGlobal('fetch', fetchMock);
    const {apiRequest} = await import('../src/api/client');
    const result = expect(apiRequest('/v1/web-push-subscriptions', {method:'PUT',token:'session'}))
      .rejects.toMatchObject({status:502});
    await vi.advanceTimersByTimeAsync(3_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 429])('does not retry rejected push registration (%s)', async status => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue({...unavailable(),status});
    vi.stubGlobal('fetch', fetchMock);
    const {apiRequest} = await import('../src/api/client');
    await expect(apiRequest('/v1/web-push-subscriptions', {method:'PUT',token:'session'})).rejects.toMatchObject({status});
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('makes a fresh request after a timeout instead of retaining the aborted signal', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
    })).mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    const result = apiRequest('/v1/bootstrap', { timeoutMs: 200 });
    await vi.advanceTimersByTimeAsync(1_200);
    expect(await result).toEqual({ ready: true });
    expect(fetchMock.mock.calls[0]![1].signal).not.toBe(fetchMock.mock.calls[1]![1].signal);
  });

  it('stops after two retries and returns the real error', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue(unavailable());
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    const result = expect(apiRequest('/v1/bootstrap')).rejects.toMatchObject({ status: 502 });
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('cancels the retry when the caller leaves or cancels the request', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Offline'));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    const controller = new AbortController();
    const result = expect(apiRequest('/v1/bootstrap', { signal: controller.signal })).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await result;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 429])('does not retry an HTTP %s rejection', async status => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue({ ...unavailable(), status });
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    await expect(apiRequest('/v1/bootstrap')).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never duplicates an order mutation after a network failure', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network failed after sending'));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');
    await expect(apiRequest('/v1/orders', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('API client request bodies', () => {
  it('uses the local API directly when the web app runs on localhost', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://unstable-tunnel.example.test');
    vi.stubEnv('EXPO_PUBLIC_SOCKET_URL', 'https://unstable-tunnel.example.test');
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
    });
    const { getApiUrl, getSocketUrl } = await import('../src/api/client');

    expect(getApiUrl()).toBe('http://localhost:4100');
    expect(getSocketUrl()).toBe('http://localhost:4100');
  });

  it('uses explicit loopback API and socket ports for an isolated local preview', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://localhost:4101');
    vi.stubEnv('EXPO_PUBLIC_SOCKET_URL', 'http://127.0.0.1:4102');
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } });
    const { getApiUrl, getSocketUrl } = await import('../src/api/client');

    expect(getApiUrl()).toBe('http://localhost:4101');
    expect(getSocketUrl()).toBe('http://127.0.0.1:4102');
  });

  it('sends an empty JSON object for a bodyless mutation', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { refreshed: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');

    await apiRequest('/v1/auth/refresh', { method: 'POST', token: 'session-token' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('keeps bodyless GET requests without a JSON body', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ready: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('../src/api/client');

    await apiRequest('/health/ready');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/health/ready',
      expect.objectContaining({ body: undefined }),
    );
  });

  it('explains an oversized upload even when a proxy returns a non-JSON 413 response', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => {
        throw new SyntaxError('HTML response');
      },
    }));
    const { apiRequest } = await import('../src/api/client');

    await expect(apiRequest('/v1/orders/order/messages', {
      method: 'POST',
      body: JSON.stringify({ attachment: true }),
    })).rejects.toMatchObject({
      status: 413,
      message: 'Размер загружаемого файла слишком большой',
    });
  });

  it('reuses a profile across token rotation and clears it after mutation, account change and logout', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true, json: async () => ({ data: { revision: fetchMock.mock.calls.length } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest, setApiCacheSession, clearApiCache } = await import('../src/api/client');
    setApiCacheSession('alice-one', 'alice');
    const first = await apiRequest('/v1/driver/profile', { token: 'alice-one' });
    setApiCacheSession('alice-two', 'alice');
    expect(await apiRequest('/v1/driver/profile', { token: 'alice-two' })).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await apiRequest('/v1/driver/status', { token: 'alice-two', method: 'POST' });
    expect(await apiRequest('/v1/driver/profile', { token: 'alice-two' })).toEqual({ revision: 3 });
    setApiCacheSession('bob-token', 'bob');
    expect(await apiRequest('/v1/driver/profile', { token: 'bob-token' })).toEqual({ revision: 4 });
    await clearApiCache();
    setApiCacheSession('bob-token', 'bob');
    expect(await apiRequest('/v1/driver/profile', { token: 'bob-token' })).toEqual({ revision: 5 });
  });
});
