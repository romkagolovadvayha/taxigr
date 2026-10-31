export type MiniAppProvider = 'max' | 'telegram';
type EmbeddedProvider = MiniAppProvider | 'vk';
const CONTEXT_KEY = 'taxi_mini_app_context';
let context: { provider: EmbeddedProvider; initData?: string; fresh: boolean } | null | undefined;

// A tab has one messenger identity. Native apps and ordinary browser tabs keep
// their existing storage and login flow. Do not share tokens through localStorage.
export function getEmbeddedAppProvider(): EmbeddedProvider | null {
  if (process.env.EXPO_OS !== 'web' || typeof window === 'undefined') return null;
  if (context === undefined) {
    const entry = /^\/(max|telegram|vk)\/?$/u.exec(window.location?.pathname ?? '')?.[1] as EmbeddedProvider | undefined;
    context = entry ? { provider: entry, fresh: true } : null;
    if (!entry) {
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(CONTEXT_KEY) ?? 'null');
        if (['max', 'telegram', 'vk'].includes(stored?.provider) && typeof stored.initData === 'string') {
          context = { provider: stored.provider, initData: stored.initData, fresh: false };
        }
      } catch { /* Storage can be unavailable in a private webview. */ }
    }
  }
  return context?.provider ?? null;
}

export function getMiniAppProvider(): MiniAppProvider | null {
  const provider = getEmbeddedAppProvider();
  return provider === 'vk' ? null : provider;
}

export function rememberMiniAppLaunch(provider: EmbeddedProvider, initData: string): void {
  context = { provider, initData, fresh: false };
  try { window.sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ provider, initData })); } catch { /* In-memory navigation still works. */ }
}

export function restoredMiniAppLaunch(): string | null {
  getEmbeddedAppProvider();
  return context && !context.fresh ? context.initData ?? null : null;
}

export function webSessionStorage(): Storage {
  return getEmbeddedAppProvider() ? window.sessionStorage : window.localStorage;
}

export function webSessionKey(key: string): string {
  const provider = getEmbeddedAppProvider();
  return provider ? `${key}_${provider}` : key;
}
