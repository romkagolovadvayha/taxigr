import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}
beforeEach(() => { vi.resetModules(); vi.stubEnv('EXPO_OS', 'web'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('mini app tab isolation', () => {
  it.each(['max', 'telegram', 'vk'])('does not reuse a previous account launch on a fresh /%s entry', async provider => {
    const sessionStorage = storage();
    sessionStorage.setItem('taxi_mini_app_context', JSON.stringify({ provider, initData: 'old-account-proof' }));
    const localStorage = storage();
    vi.stubGlobal('window', { location: { pathname: `/${provider}` }, sessionStorage, localStorage });
    const runtime = await import('../src/mini-apps/runtime');
    expect(runtime.getEmbeddedAppProvider()).toBe(provider);
    expect(runtime.restoredMiniAppLaunch()).toBeNull();
    expect(runtime.webSessionStorage()).toBe(sessionStorage);
    expect(runtime.webSessionKey('token')).toBe(`token_${provider}`);
  });
  it('keeps the verified launch across internal navigation and a tab reload', async () => {
    const sessionStorage = storage();
    const location = { pathname: '/max' };
    vi.stubGlobal('window', { location, sessionStorage, localStorage: storage() });
    let runtime = await import('../src/mini-apps/runtime');
    runtime.rememberMiniAppLaunch('max', 'signed-fixture');
    location.pathname = '/order-confirmation';
    vi.resetModules(); runtime = await import('../src/mini-apps/runtime');
    expect(runtime.getMiniAppProvider()).toBe('max');
    expect(runtime.restoredMiniAppLaunch()).toBe('signed-fixture');
  });
  it('preserves the ordinary website storage and does nothing on Android', async () => {
    const localStorage = storage();
    vi.stubGlobal('window', { location: { pathname: '/' }, sessionStorage: storage(), localStorage });
    const runtime = await import('../src/mini-apps/runtime');
    expect(runtime.getEmbeddedAppProvider()).toBeNull();
    expect(runtime.webSessionStorage()).toBe(localStorage);
    expect(runtime.webSessionKey('token')).toBe('token');
    vi.stubEnv('EXPO_OS', 'android');
    expect(runtime.getEmbeddedAppProvider()).toBeNull();
  });
});
