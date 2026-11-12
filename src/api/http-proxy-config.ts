type ProxyConfiguration = { apiUrl: string; socketUrl: string; socketPath: string };
const loopback = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

export function readHttpProxyConfig(): ProxyConfiguration | null {
  const value = process.env.EXPO_PUBLIC_FALLBACK_API_URL ??
    (process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') === 'https://api.taxigr.ru' ? 'https://hooks.prostoj.store/taxigr' : undefined);
  if (!value) return null;
  try {
    const url = new URL(value);
    const localWeb = process.env.EXPO_OS === 'web' && loopback.test(value) && loopback.test(process.env.EXPO_PUBLIC_API_URL ?? '');
    if (['localhost','127.0.0.1','[::1]'].includes(url.hostname) && !localWeb) return null;
    if ((url.protocol !== 'https:' && !localWeb) || url.username || url.password || url.search || url.hash) return null;
    const prefix = url.pathname.replace(/\/+$/, '');
    const apiUrl = `${url.origin}${prefix}`;
    if (apiUrl === process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '')) return null;
    return { apiUrl, socketUrl: url.origin, socketPath: `${prefix}/socket.io` };
  } catch { return null; }
}
