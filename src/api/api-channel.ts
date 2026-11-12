export type ApiChannel = 'primary' | 'proxy' | 'max' | 'vk';
let channel: ApiChannel = 'primary';
let retryPrimaryAt = 0;
let retryProxyAt = 0;
const listeners = new Set<() => void>();
export function getApiChannel(): ApiChannel { return channel; }
export function subscribeApiChannel(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setApiChannel(next: ApiChannel): void {
  if (next === 'primary') retryPrimaryAt = 0;
  else if (channel !== next && retryPrimaryAt <= Date.now()) retryPrimaryAt = Date.now() + 15_000;
  if (next === 'proxy') retryProxyAt = 0;
  if (channel === next) return;
  channel = next; for (const listener of listeners) listener();
}
export function markPrimaryUnavailable(): void { retryPrimaryAt = Date.now() + 15_000; }
export function shouldTryPrimary(): boolean {
  if (Date.now() < retryPrimaryAt) return false;
  // Only one concurrent request tests a recovered route. Other readers keep
  // using the working fallback until this request succeeds.
  if (channel !== 'primary') retryPrimaryAt = Date.now() + 15_000;
  return true;
}
export function markProxyUnavailable(): void { retryProxyAt = Date.now() + 15_000; }
export function shouldTryProxy(): boolean {
  if (Date.now() < retryProxyAt) return false;
  if (retryProxyAt && channel !== 'proxy') retryProxyAt = Date.now() + 15_000;
  return true;
}
