import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ prepare: vi.fn<() => Promise<void>>() }));
const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('../modules/taxigr-webview-startup', () => ({ default: native }));

beforeEach(() => {
  vi.resetModules();
  native.prepare.mockReset().mockResolvedValue();
  platform.OS = 'android';
});

describe('native map engine preparation', () => {
  it('keeps all maps pending until the native engine is ready, starting it once', async () => {
    let resolve!: () => void;
    native.prepare.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const { prepareMapWebView } = await import('../src/components/map/webview-startup');
    const a = prepareMapWebView();
    const b = prepareMapWebView();
    const mount = vi.fn();
    void a.then(mount);
    await Promise.resolve();
    expect(a).toBe(b);
    expect(native.prepare).toHaveBeenCalledOnce();
    expect(mount).not.toHaveBeenCalled();
    resolve();
    await a;
    expect(mount).toHaveBeenCalledOnce();
    await prepareMapWebView();
    expect(native.prepare).toHaveBeenCalledOnce();
  });

  it('does not construct a WebView or repeat a failed native startup', async () => {
    const failure = new Error('WebView unavailable');
    native.prepare.mockRejectedValue(failure);
    const { prepareMapWebView } = await import('../src/components/map/webview-startup');
    await expect(prepareMapWebView()).rejects.toBe(failure);
    await expect(prepareMapWebView()).rejects.toBe(failure);
    expect(native.prepare).toHaveBeenCalledOnce();
  });

  it('does not initialize Android WebView on iOS', async () => {
    platform.OS = 'ios';
    const { prepareMapWebView } = await import('../src/components/map/webview-startup');
    await prepareMapWebView();
    expect(native.prepare).not.toHaveBeenCalled();
  });
});
