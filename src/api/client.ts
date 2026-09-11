import { readApiCache, writeApiCache } from '../storage/api-cache-storage';
import { mutationCacheTags, responseCachePolicy } from './cache-policy';
import { ResponseCache } from './response-cache';

const responseCache = new ResponseCache({ read: readApiCache, write: writeApiCache });
const sessionOwners = new Map<string, string>();
let cacheOwner: string | null = null;

export function setApiCacheSession(token: string, userId: string): void {
  if (cacheOwner && cacheOwner !== userId) {
    responseCache.invalidate();
    sessionOwners.clear();
  }
  cacheOwner = userId;
  sessionOwners.set(token, userId);
  if (sessionOwners.size > 4) sessionOwners.delete(sessionOwners.keys().next().value!);
}

export function invalidateApiCache(tags?: readonly string[]): void {
  if (!tags || tags.length) responseCache.invalidate(tags);
}

export async function clearApiCache(): Promise<void> {
  responseCache.invalidate();
  sessionOwners.clear();
  cacheOwner = null;
  await responseCache.flush();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const configuredSocketUrl = process.env.EXPO_PUBLIC_SOCKET_URL?.replace(/\/$/, '');
const localWebApiUrl = 'http://localhost:4100';

function isLocalWebRuntime(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export function getApiUrl(): string {
  if (isLocalWebRuntime()) return localWebApiUrl;
  if (!configuredApiUrl) {
    throw new ApiError('Адрес API не настроен', 0, 'API_URL_MISSING');
  }
  return configuredApiUrl;
}

export function getSocketUrl(): string | null {
  if (isLocalWebRuntime()) return localWebApiUrl;
  return configuredSocketUrl ?? configuredApiUrl ?? null;
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${getApiUrl()}${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || options.headers) {
    const result = await requestFromNetwork<T>(path, options);
    if (method !== 'GET') invalidateApiCache(mutationCacheTags(path));
    return result;
  }
  const policy = responseCachePolicy(path);
  const owner = options.token ? sessionOwners.get(options.token) : 'public';
  const scope = owner ?? `token:${options.token}`;
  const url = new URL(path, `${getApiUrl()}/`);
  url.searchParams.sort();
  try {
    return await responseCache.read<T>(`${scope}:${url}`, { ...policy, persist: policy.persist && Boolean(owner) },
      signal => requestFromNetwork<T>(path, { ...options, signal }), options.signal, options.cache === 'reload' || options.cache === 'no-store');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED');
    throw error;
  }
}

async function requestFromNetwork<T>(
  path: string,
  options: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<T> {
  const {
    token,
    timeoutMs = 12_000,
    headers,
    signal: externalSignal,
    ...requestOptions
  } = options;
  const method = (requestOptions.method ?? 'GET').toUpperCase();
  const emptyJsonBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? '{}' : undefined;
  const body = requestOptions.body ?? emptyJsonBody;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      ...requestOptions,
      body,
      signal: controller.signal,
      cache: token ? 'no-store' : requestOptions.cache,
      headers: {
        Accept: 'application/json',
        ...(token ? { 'Cache-Control': 'no-cache' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: { message?: string; code?: string };
    };

    if (!response.ok) {
      throw new ApiError(
        payload.error?.message ?? (response.status === 413
          ? 'Размер загружаемого файла слишком большой'
          : `Ошибка сервера (${response.status})`),
        response.status,
        payload.error?.code,
      );
    }

    return (payload.data ?? payload) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) {
        throw new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED');
      }
      throw new ApiError('Сервер не ответил вовремя', 0, 'TIMEOUT');
    }
    throw new ApiError('Нет связи с сервером', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}
