import { afterEach, describe, expect, it, vi } from 'vitest';

type Api = NonNullable<Window['ymaps3']>;

function browser() {
  vi.stubEnv('EXPO_PUBLIC_YANDEX_MAPS_API_KEY', 'test-key');
  const browserWindow: EventTarget & { ymaps3?: Api } = new EventTarget();
  const scripts: {
    src: string;
    async: boolean;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal('window', browserWindow);
  vi.stubGlobal('document', {
    createElement: () => {
      const script = { src: '', async: false, onload: null, onerror: null, remove: vi.fn() };
      scripts.push(script);
      return script;
    },
    head: { appendChild: vi.fn() },
  });
  return { browserWindow, scripts };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Yandex map loader recovery', () => {
  it('shares one script and waits for SDK readiness for concurrent maps', async () => {
    const { browserWindow, scripts } = browser();
    const { loadYandexMap } = await import('../src/components/map/yandex-map-loader');
    const first = loadYandexMap();
    const second = loadYandexMap();
    expect(scripts).toHaveLength(1);
    const api = { ready: Promise.resolve() } as Api;
    browserWindow.ymaps3 = api;
    scripts[0]!.onload!();
    expect(await first).toBe(api);
    expect(await second).toBe(api);
    expect(await loadYandexMap()).toBe(api);
  });

  it('removes a failed script and allows the next attempt to succeed', async () => {
    const { browserWindow, scripts } = browser();
    const { loadYandexMap } = await import('../src/components/map/yandex-map-loader');
    const failed = expect(loadYandexMap()).rejects.toThrow('Не удалось загрузить Яндекс Карты');
    scripts[0]!.onerror!();
    await failed;
    expect(scripts[0]!.remove).toHaveBeenCalledOnce();
    const retried = loadYandexMap();
    expect(scripts).toHaveLength(2);
    const api = { ready: Promise.resolve() } as Api;
    browserWindow.ymaps3 = api;
    scripts[1]!.onload!();
    expect(await retried).toBe(api);
  });

  it('propagates a rejected SDK ready promise instead of leaving the caller pending', async () => {
    const { browserWindow, scripts } = browser();
    const { loadYandexMap } = await import('../src/components/map/yandex-map-loader');
    const failed = expect(loadYandexMap()).rejects.toThrow('SDK initialization failed');
    browserWindow.ymaps3 = { ready: Promise.reject(new Error('SDK initialization failed')) } as Api;
    scripts[0]!.onload!();
    await failed;
    expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  });

  it('times out a silent script load and permits a fresh attempt', async () => {
    vi.useFakeTimers();
    const { browserWindow, scripts } = browser();
    const { loadYandexMap } = await import('../src/components/map/yandex-map-loader');
    const failed = expect(loadYandexMap()).rejects.toThrow('слишком много времени');
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(scripts[0]!.onload).toBeNull();
    const retried = loadYandexMap();
    browserWindow.ymaps3 = { ready: Promise.resolve() } as Api;
    scripts[1]!.onload!();
    await retried;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out an already present SDK whose ready promise never settles', async () => {
    vi.useFakeTimers();
    const { browserWindow, scripts } = browser();
    browserWindow.ymaps3 = { ready: new Promise(() => {}) } as Api;
    const { loadYandexMap } = await import('../src/components/map/yandex-map-loader');
    const failed = expect(loadYandexMap()).rejects.toThrow('слишком много времени');
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(scripts).toHaveLength(0);
  });
});
