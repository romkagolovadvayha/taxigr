const statePattern = /^[A-Za-z0-9_-]{43}$/u;

export function vkNativeLoginCode(state: string): string {
  return state.slice(0, 6).toUpperCase();
}

export function vkNativeLoginUrl(appId: string, state: string): string {
  if (!/^\d+$/u.test(appId) || !statePattern.test(state)) {
    throw new Error('Invalid VK native login link');
  }
  return `https://vk.com/app${appId}#native_auth=${encodeURIComponent(state)}`;
}

export function parseVkNativeLoginState(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/u, ''));
  const values = params.getAll('native_auth');
  return values.length === 1 && statePattern.test(values[0]!) ? values[0]! : null;
}
