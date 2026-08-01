import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('frontend error reporter', () => {
  it('sends useful browser context once without exposing the Telegram token', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test');
    vi.stubGlobal('window', { location: { hostname: 'taxigr.ru' } });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.doMock('expo-constants', () => ({
      default: { expoConfig: { version: '1.2.3' } },
    }));
    vi.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { reportCriticalClientError } = await import('../src/errors/critical-error-reporter');
    const error = new Error('Chunk failed to load');
    const options = {
      source: 'resource-error' as const,
      route: '/orders/current',
      token: 'session-token',
      fatal: true,
      resource: 'https://taxigr.ru/_expo/static/js/web/entry.js',
      filename: 'entry.js',
      line: 42,
      column: 7,
    };

    await reportCriticalClientError(error, options);
    await reportCriticalClientError(error, options);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/client-errors');
    expect(request).toEqual(expect.objectContaining({ method: 'POST', keepalive: true }));
    expect(request.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer session-token' }));
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      source: 'resource-error',
      message: 'Chunk failed to load',
      route: '/orders/current',
      resource: 'https://taxigr.ru/_expo/static/js/web/entry.js',
      filename: 'entry.js',
      line: 42,
      column: 7,
      online: true,
      visibilityState: 'visible',
      appVersion: '1.2.3',
    }));
  });
});
