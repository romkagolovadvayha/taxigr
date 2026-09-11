import type { CachePolicy } from './response-cache';

const endedOrder = (value: unknown) => !!value && typeof value === 'object' &&
  'status' in value && (value.status === 'completed' || value.status === 'cancelled');

/** Only listed reads can be reused. Live ride control and quotes always reach the API. */
export function responseCachePolicy(path: string): CachePolicy {
  const url = new URL(path, 'https://api.invalid');
  const route = url.pathname;
  if (/^\/v1\/addresses\/(search|preview)$/.test(route)) return {
    tag: 'addresses', ttlMs: url.searchParams.get('kind') ? 86_400_000 : 15 * 60_000, persist: true,
    accept: value => Array.isArray(value) && value.length > 0,
  };
  if (route === '/v1/me/notification-channels') return { tag: 'profile', ttlMs: 60_000 };
  if (/^\/v1\/(driver\/profile|driver\/vehicle-change-requests\/me|driver-applications\/me)$/.test(route)) {
    return { tag: 'profile', ttlMs: 30_000 };
  }
  if (route === '/v1/orders') return { tag: 'orders', ttlMs: 15_000 };
  if (/^\/v1\/orders\/[^/]+$/.test(route)) return { tag: 'orders', ttlMs: 60_000, accept: endedOrder };
  if (route === '/v1/driver/earnings') return { tag: 'stats', ttlMs: 30_000 };
  if (/^\/v1\/admin\/(metrics|drivers|passengers)(\/[^/]+)?$/.test(route)) return { tag: 'admin', ttlMs: 15_000 };
  if (/^\/v1\/admin\/(places|applications|vehicle-change-requests|tariffs|driver-dispatch-settings)$/.test(route)) {
    return { tag: 'admin', ttlMs: 30_000 };
  }
  return { tag: 'live', ttlMs: 0 };
}

export function mutationCacheTags(path: string): string[] {
  if (path.startsWith('/v1/addresses/points')) return ['addresses'];
  if (path.startsWith('/v1/admin/')) return ['admin', 'profile', 'orders', 'stats', 'addresses'];
  if (/\/location(?:\/|$)|\/messages\/read$/.test(path)) return [];
  if (path.startsWith('/v1/orders') || path.startsWith('/v1/driver/orders')) return ['orders', 'stats', 'admin', 'profile'];
  if (path.startsWith('/v1/driver/') || path.startsWith('/v1/driver-applications')) return ['profile', 'admin', 'stats'];
  if (path.startsWith('/v1/me/')) return ['profile'];
  return [];
}
