import type { Address } from '@/domain/models';
import { apiRequest } from './client';

export type MapAddressOptions = { token?: string | null; signal?: AbortSignal };

export async function searchMapAddresses(query: string, options: MapAddressOptions, kind?: 'street' | 'house'): Promise<Address[]> {
  if (!options.token || options.signal?.aborted) return [];
  const demo = options.token.startsWith('demo:');
  const endpoint = demo ? '/v1/addresses/preview' : '/v1/addresses/search';
  const result = await apiRequest<Address[]>(endpoint + '?query=' + encodeURIComponent(query) + (kind ? '&kind=' + kind : ''), {
    token: demo ? undefined : options.token, signal: options.signal, timeoutMs: kind === 'house' ? 20_000 : 5_000,
  });
  return Array.isArray(result) ? result : [];
}
