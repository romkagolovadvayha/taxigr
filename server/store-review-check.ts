import { randomUUID } from 'node:crypto';

import { currentInitialLegalAcceptance } from '../src/legal/documents';
import { PLAY_REVIEW_CODE, PLAY_REVIEW_PHONE } from './play-review-auth';

type ReviewUser = {
  id?: string;
  phone?: string;
  roles?: string[];
  profileComplete?: boolean;
};

export async function checkStoreReviewAuth(
  apiUrl: string,
  fetchRequest: typeof fetch = fetch,
): Promise<string[]> {
  const url = new URL(apiUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Provide the API origin without credentials, path, query or fragment');
  }
  const installationId = `store-review-check-${randomUUID()}`;
  const checks: string[] = [];

  async function request<T>(path: string, body?: object, token?: string): Promise<T> {
    let response: Response;
    try {
      response = await fetchRequest(`${url.origin}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TaxiGR-Store-Review-Check/1.0',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
      });
    } catch {
      throw new Error(`${path}: connection failed or timed out`);
    }
    // Never include response bodies or tokens in deployment logs.
    if (!response.ok) {
      throw new Error(`${path}: HTTP ${response.status}${response.status === 429
        ? '; review login is rate limited; wait before running the check again' : ''}`);
    }
    const payload = await response.json().catch(() => null) as { data?: T } | null;
    if (!payload?.data || typeof payload.data !== 'object') {
      throw new Error(`${path}: expected an API JSON response`);
    }
    checks.push(`${path}: HTTP ${response.status}`);
    return payload.data;
  }

  function assertReviewUser(user: ReviewUser | undefined, expectedId?: string): string {
    if (!user?.id || (expectedId && user.id !== expectedId) ||
        user.phone !== PLAY_REVIEW_PHONE || user.profileComplete !== true ||
        !Array.isArray(user.roles) || user.roles.length !== 1 || user.roles[0] !== 'passenger') {
      throw new Error('Review account must have a complete profile and passenger-only access');
    }
    return user.id;
  }

  const health = await request<{ status?: string }>('/health/ready');
  if (health.status !== 'ready') throw new Error('API is not ready');
  await request('/v1/auth/phone/start', {
    phone: PLAY_REVIEW_PHONE,
    installationId,
    legalAcceptance: currentInitialLegalAcceptance(),
  });
  const session = await request<{ token?: string; user?: ReviewUser }>('/v1/auth/phone/verify', {
    phone: PLAY_REVIEW_PHONE,
    code: PLAY_REVIEW_CODE,
    installationId,
  });
  if (typeof session.token !== 'string' || !session.token) {
    throw new Error('Phone verification did not return a session token');
  }
  const userId = assertReviewUser(session.user);
  assertReviewUser(await request<ReviewUser>('/v1/me', undefined, session.token), userId);
  const refreshed = await request<{ token?: string; user?: ReviewUser }>(
    '/v1/auth/refresh', {}, session.token,
  );
  if (typeof refreshed.token !== 'string' || !refreshed.token) {
    throw new Error('Session refresh did not return a session token');
  }
  assertReviewUser(refreshed.user, userId);
  assertReviewUser(await request<ReviewUser>('/v1/me', undefined, refreshed.token), userId);
  return checks;
}
