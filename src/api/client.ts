import { readApiCache, writeApiCache } from '../storage/api-cache-storage';
import { mutationCacheTags, responseCachePolicy } from './cache-policy';
import { ResponseCache } from './response-cache';
import { getApiChannel, markPrimaryUnavailable, markProxyUnavailable, setApiChannel, shouldTryPrimary, shouldTryProxy } from './api-channel';
import { readHttpProxyConfig } from './http-proxy-config';
import { reserveChannelsEnabled } from './reserve-config';
import { requestThroughReserve } from './reserve-request';
import { relayRandomBytes } from './relay-random';
import { offlineReadablePath, offlineSnapshots } from '../offline/snapshots';
import { hasPhysicalConnectivity, setServerReachable } from '../offline/connectivity';

type ApiRequestOptions = RequestInit & { token?: string; timeoutMs?: number; offlineFallback?: boolean };
export function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (['NETWORK_ERROR','TIMEOUT','INVALID_RESPONSE'].includes(error.code ?? '')) return true;
  // A handled business/provider failure proves the API answered. Sending it
  // through a messenger would call the same broken provider again.
  return [502,503,504].includes(error.status) && (!error.code ||
    ['BAD_GATEWAY','GATEWAY_TIMEOUT','UPSTREAM_UNAVAILABLE','API_UNAVAILABLE','PROXY_UNAVAILABLE','TEST_PRIMARY_OFFLINE'].includes(error.code));
}

const responseCache = new ResponseCache({ read: readApiCache, write: writeApiCache });
const sessionOwners = new Map<string, string>();
let cacheOwner: string | null = null;
let primarySuccessVersion = 0;
let proxySuccessVersion = 0;

function requestHeaderRecord(input?: HeadersInit): Record<string, string> {
  const names: Record<string,string> = { authorization:'Authorization', accept:'Accept', 'content-type':'Content-Type', 'cache-control':'Cache-Control', 'x-taxi-request-id':'X-Taxi-Request-Id' };
  const headers: Record<string,string> = {};
  new Headers(input).forEach((value,name) => { headers[names[name] ?? name] = value; });
  return headers;
}

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
  await offlineSnapshots.clear();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const configuredSocketUrl = process.env.EXPO_PUBLIC_SOCKET_URL?.replace(/\/$/, '');
const loopbackUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;
const localWebApiUrl = configuredApiUrl && loopbackUrl.test(configuredApiUrl) ? configuredApiUrl : 'http://localhost:4100';

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
  if (isLocalWebRuntime()) {
    return configuredSocketUrl && loopbackUrl.test(configuredSocketUrl) ? configuredSocketUrl : localWebApiUrl;
  }
  return configuredSocketUrl ?? configuredApiUrl ?? null;
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^(?:data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
  const proxy = getApiChannel() === 'proxy' ? readHttpProxyConfig() : null;
  if (/^https?:/i.test(pathOrUrl)) {
    if (!proxy) return pathOrUrl;
    const target = new URL(pathOrUrl), primary = new URL(`${getApiUrl()}/`);
    if (target.origin !== primary.origin || !/^\/(?:v1|uploads)\//.test(target.pathname)) return pathOrUrl;
    return `${proxy.apiUrl}${target.pathname}${target.search}${target.hash}`;
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${proxy?.apiUrl ?? getApiUrl()}${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { offlineFallback, ...networkOptions } = options;
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || options.headers) {
    let result: T;
    try { result = await requestFromNetwork<T>(path, networkOptions); }
    catch (error) { if (isConnectionFailure(error)) setServerReachable(false); throw error; }
    if (method !== 'GET') invalidateApiCache(mutationCacheTags(path));
    return result;
  }
  const policy = responseCachePolicy(path);
  const owner = options.token ? sessionOwners.get(options.token) : 'public';
  const scope = owner ?? `token:${options.token}`;
  const url = new URL(path, `${getApiUrl()}/`);
  url.searchParams.sort();
  try {
    const result = await responseCache.read<T>(`${scope}:${url}`, { ...policy, persist: policy.persist && Boolean(owner) },
      signal => requestFromNetwork<T>(path, { ...networkOptions, signal }), options.signal, options.cache === 'reload' || options.cache === 'no-store',options.token);
    if (owner && owner !== 'public' && cacheOwner === owner && offlineReadablePath(path)) {
      // Saving a fallback copy must not delay a fresh response on a slow disk.
      void offlineSnapshots.set(owner,path,result).catch(() => undefined);
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED');
    if (isConnectionFailure(error)) {
      setServerReachable(false);
      if (offlineFallback && owner && cacheOwner === owner && offlineReadablePath(path)) {
        const snapshot = await offlineSnapshots.get<T>(owner,path);
        if (snapshot && cacheOwner === owner) return snapshot;
      }
    }
    throw error;
  }
}

async function requestFromNetwork<T>(
  path: string,
  options: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (options.signal?.aborted) throw new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED');
  if (!hasPhysicalConnectivity()) throw new ApiError('Нет соединения. Карта и сохранённые данные доступны.', 0, 'NETWORK_ERROR');
  const relay = reserveChannelsEnabled();
  const proxy = readHttpProxyConfig();
  const failover = relay || !!proxy;
  const primaryVersion = primarySuccessVersion;
  const proxyVersion = proxySuccessVersion;
  const requestId = failover && !['GET','HEAD','OPTIONS'].includes(method)
    ? Array.from(relayRandomBytes(24), value => value.toString(16).padStart(2, '0')).join('') : undefined;
  const routedOptions = requestId ? { ...options, headers: { ...requestHeaderRecord(options.headers), 'X-Taxi-Request-Id': requestId } } : options;
  // Retrying these reads, session refresh and subscription upsert is safe after
  // a failed CORS preflight or a brief connection loss on browser resume.
  const recoverTransient = !failover && ((method === 'GET' && ['/v1/bootstrap', '/v1/push/config'].includes(path)) ||
    (method === 'POST' && path === '/v1/auth/refresh') ||
    (method === 'PUT' && path === '/v1/web-push-subscriptions'));
  for (let attempt = 0; ; attempt += 1) {
    try {
      let unavailable: unknown = new ApiError('Нет связи с сервером', 0, 'NETWORK_ERROR');
      const largeUpload = typeof options.body === 'string' && options.body.length > 64_000;
      if (!failover || shouldTryPrimary()) {
        try {
          const value = await requestOnce<T>(path, failover ? { ...routedOptions, timeoutMs: Math.min(options.timeoutMs ?? 12_000, largeUpload ? 12_000 : 3000) } : routedOptions);
          primarySuccessVersion++;
          if (failover) setApiChannel('primary');
          return value;
        } catch (error) {
          if (!failover || !isConnectionFailure(error) || options.signal?.aborted) throw error;
          unavailable = error;
          if (primaryVersion === primarySuccessVersion) markPrimaryUnavailable();
        }
      }
      if (options.signal?.aborted) throw new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED');
      if (proxy && shouldTryProxy()) {
        try {
          const value = await requestOnce<T>(path, { ...routedOptions, timeoutMs: Math.min(options.timeoutMs ?? 12_000, largeUpload ? 12_000 : 5000) }, proxy.apiUrl);
          proxySuccessVersion++;
          // A request started before recovery must not move the shared socket
          // back to an older route after a fresher primary response succeeded.
          if (primaryVersion === primarySuccessVersion) setApiChannel('proxy');
          return value;
        } catch (error) {
          if (!isConnectionFailure(error) || options.signal?.aborted) throw error;
          unavailable = error;
          if (proxyVersion === proxySuccessVersion) markProxyUnavailable();
        }
      }
      if (relay) {
        try {
          if (options.body != null && typeof options.body !== 'string') throw new ApiError('Этот формат загрузки пока недоступен по резервному каналу', 400, 'MAX_RELAY_BODY_UNSUPPORTED');
          const response = await requestThroughReserve({ method, path, token: options.token,
            body: typeof options.body === 'string' ? options.body : method === 'GET' ? undefined : '{}', requestId }, options.signal ?? undefined,
          Math.min(120_000, Math.max(options.timeoutMs ?? 12_000, typeof options.body === 'string' && options.body.length > 64_000 ? 120_000 : 60_000)));
          const payload = JSON.parse(response.body || '{}') as { data?: T; error?: { message?: string; code?: string; details?: unknown } };
          setServerReachable(true);
          if (response.status >= 400) throw new ApiError(payload.error?.message ?? `Ошибка сервера (${response.status})`, response.status, payload.error?.code, payload.error?.details);
          return (payload.data ?? payload) as T;
        } catch (error) {
          if (error instanceof ApiError) throw error;
          if (options.signal?.aborted) throw new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED');
          throw new ApiError('Не удалось получить ответ по резервному каналу. Обновите данные перед повтором.', 0, 'TIMEOUT');
        }
      }
      throw unavailable;
    } catch (error) {
      const transient = isConnectionFailure(error);
      if (!recoverTransient || !transient || attempt >= 2 || options.signal?.aborted) throw error;
      await waitForRequestRetry((attempt + 1) * 1_000, options.signal);
    }
  }
}

function waitForRequestRetry(delay: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new ApiError('Запрос отменён', 0, 'REQUEST_ABORTED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function requestOnce<T>(
  path: string,
  options: RequestInit & { token?: string; timeoutMs?: number } = {},
  baseUrl = getApiUrl(),
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
  const abortedRequest = () => new ApiError(externalSignal?.aborted ? 'Запрос отменён' : 'Сервер не ответил вовремя', 0, externalSignal?.aborted ? 'REQUEST_ABORTED' : 'TIMEOUT');

  try {
    if (controller.signal.aborted) throw abortedRequest();
    const response = await fetch(`${baseUrl}${path}`, {
      ...requestOptions,
      body,
      signal: controller.signal,
      cache: token ? 'no-store' : requestOptions.cache,
      headers: {
        Accept: 'application/json',
        ...(token ? { 'Cache-Control': 'no-cache' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...requestHeaderRecord(headers),
      },
    });
    setServerReachable(true);

    let parsed: unknown;
    try { parsed = await response.json(); }
    catch {
      if (controller.signal.aborted) throw abortedRequest();
      if (response.ok && response.status !== 204) throw new ApiError('Сервер вернул некорректный ответ', 0, 'INVALID_RESPONSE');
      parsed = {};
    }
    if (controller.signal.aborted) throw abortedRequest();
    if (response.ok && response.status !== 204 && (parsed === null || typeof parsed !== 'object')) throw new ApiError('Сервер вернул некорректный ответ', 0, 'INVALID_RESPONSE');
    const payload = (parsed ?? {}) as {
      data?: T;
      error?: { message?: string; code?: string; details?: unknown };
    };

    if (!response.ok) {
      throw new ApiError(
        payload.error?.message ?? (response.status === 413
          ? 'Размер загружаемого файла слишком большой'
          : `Ошибка сервера (${response.status})`),
        response.status,
        payload.error?.code,
        payload.error?.details,
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
