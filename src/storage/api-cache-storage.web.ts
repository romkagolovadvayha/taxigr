const KEY = 'taxigr_address_cache_v1';
export async function readApiCache(): Promise<string | null> {
  try { return typeof window === 'undefined' ? null : window.localStorage.getItem(KEY); } catch { return null; }
}
export async function writeApiCache(value: string): Promise<void> {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(KEY, value); } catch { /* Quota or private browsing. */ }
}
