import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
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
