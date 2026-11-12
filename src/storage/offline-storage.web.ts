const KEY = 'taxigr_offline_v1';
export async function readOfflineData(): Promise<string | null> {
  try { return typeof window === 'undefined' ? null : window.localStorage.getItem(KEY); } catch { return null; }
}
export async function writeOfflineData(value: string): Promise<void> {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY,value);
}
