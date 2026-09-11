import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ElementStub = { tag: string; id?: string; src?: string; href?: string; sheet?: object; type?: string; onload?: () => void; onerror?: () => void; remove: () => void };
let elements: ElementStub[];
let browser: { __taxiMapLibre?: object };
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); elements = []; browser = {};
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', {
    getElementById: (id: string) => elements.find(element => element.id === id),
    createElement: (tag: string) => {
      const element: ElementStub = { tag, remove: () => { elements = elements.filter(item => item !== element); } };
      return element;
    },
    head: { appendChild: (element: ElementStub) => elements.push(element) },
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const css = () => elements.find(element => element.tag === 'link')!;
const script = () => elements.find(element => element.tag === 'script')!;

describe('same-origin MapLibre loader', () => {
  it('shares concurrent requests and waits for both the module and stylesheet', async () => {
    const { loadMapLibre } = await import('../src/components/map/maplibre-loader.web');
    const first = loadMapLibre(); expect(loadMapLibre()).toBe(first);
    expect(script().src).toMatch(/^\/vendor\/maplibre\/[\d.]+\/entry\.mjs$/);
    expect(script().type).toBe('module');
    browser.__taxiMapLibre = { Map: 'test' }; script().onload?.();
    let resolved = false; void first.then(() => { resolved = true; });
    await Promise.resolve(); expect(resolved).toBe(false);
    css().sheet = {}; css().onload?.();
    expect(await first).toBe(browser.__taxiMapLibre);
    expect(await loadMapLibre()).toBe(browser.__taxiMapLibre);
    expect(elements).toHaveLength(2);
  });
  it('allows retry after a stylesheet failure, even when the module succeeded', async () => {
    const { loadMapLibre } = await import('../src/components/map/maplibre-loader.web');
    const first = loadMapLibre(); const rejected = expect(first).rejects.toThrow('оформление');
    browser.__taxiMapLibre = {}; script().onload?.(); css().onerror?.(); await rejected;
    const retry = loadMapLibre(); css().sheet = {}; css().onload?.();
    expect(await retry).toBe(browser.__taxiMapLibre);
  });
  it('allows retry after the module could not load', async () => {
    const { loadMapLibre } = await import('../src/components/map/maplibre-loader.web');
    const first = loadMapLibre(); const rejected = expect(first).rejects.toThrow('MapLibre');
    css().sheet = {}; css().onload?.(); script().onerror?.(); await rejected;
    const retry = loadMapLibre();
    expect(script().src).toMatch(/entry\.mjs\?attempt=1$/);
    browser.__taxiMapLibre = {}; script().onload?.();
    expect(await retry).toBe(browser.__taxiMapLibre);
  });
  it('reuses the versioned URL after a full application restart', async () => {
    const { loadMapLibre } = await import('../src/components/map/maplibre-loader.web');
    const first = loadMapLibre(); const firstUrl = script().src;
    browser.__taxiMapLibre = {}; script().onload?.(); css().sheet = {}; css().onload?.();
    await first;
    vi.resetModules(); elements = []; delete browser.__taxiMapLibre;
    vi.setSystemTime(Date.now() + 60_000);
    const restarted = (await import('../src/components/map/maplibre-loader.web')).loadMapLibre();
    expect(script().src).toBe(firstUrl);
    browser.__taxiMapLibre = {}; script().onload?.(); css().onload?.(); await restarted;
  });
  it('rejects a hanging connection instead of spinning indefinitely', async () => {
    const { loadMapLibre } = await import('../src/components/map/maplibre-loader.web');
    const request = loadMapLibre(); const rejected = expect(request).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20_000); await rejected;
    expect(elements).toHaveLength(0);
  });
});
