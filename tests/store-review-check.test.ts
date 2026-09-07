import { describe, expect, it, vi } from 'vitest';

import { checkStoreReviewAuth } from '../server/store-review-check';
import { PLAY_REVIEW_PHONE } from '../server/play-review-auth';
import { currentInitialLegalAcceptance } from '../src/legal/documents';

const user = {
  id: 'review-passenger', phone: PLAY_REVIEW_PHONE, roles: ['passenger'], profileComplete: true,
};
const json = (data: unknown) => new Response(JSON.stringify({ data }), {
  headers: { 'Content-Type': 'application/json' },
});
function passingFetch() {
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(json({ status: 'ready' }))
    .mockResolvedValueOnce(json({ retryAfterSeconds: 180 }))
    .mockResolvedValueOnce(json({ token: 'private-session-token', user }))
    .mockResolvedValueOnce(json(user))
    .mockResolvedValueOnce(json({ token: 'private-refreshed-token', user }))
    .mockResolvedValueOnce(json(user));
}

describe('store review release check', () => {
  it('checks the real login and restored session without placing a ride or logging tokens', async () => {
    const fetchMock = passingFetch();
    const checks = await checkStoreReviewAuth('https://api.example.test', fetchMock);

    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/health/ready', '/v1/auth/phone/start', '/v1/auth/phone/verify',
      '/v1/me', '/v1/auth/refresh', '/v1/me',
    ]);
    const start = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const verify = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(start).toMatchObject({ phone: PLAY_REVIEW_PHONE, legalAcceptance: currentInitialLegalAcceptance() });
    expect(verify).toEqual({ phone: PLAY_REVIEW_PHONE, code: '4455', installationId: start.installationId });
    expect(fetchMock.mock.calls[5]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer private-refreshed-token' });
    expect(checks).toHaveLength(6);
    expect(checks.join('\n')).not.toContain('private-');
  });

  it('fails at the phone step on a proxy 502 even when health is green', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ status: 'ready' }))
      .mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(checkStoreReviewAuth('https://api.example.test', fetchMock))
      .rejects.toThrow('/v1/auth/phone/start: HTTP 502');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry phone mutations or expose an upstream error body', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ status: 'ready' }))
      .mockResolvedValueOnce(new Response('private-provider-credential', { status: 429 }));
    await expect(checkStoreReviewAuth('https://api.example.test', fetchMock))
      .rejects.toThrow('/v1/auth/phone/start: HTTP 429; review login is rate limited; wait before running the check again');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...user, roles: ['passenger', 'admin'] },
    { ...user, profileComplete: false },
    { ...user, phone: '+79123456789' },
  ])('rejects an unsuitable review account (%j)', async (invalidUser) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ status: 'ready' }))
      .mockResolvedValueOnce(json({ retryAfterSeconds: 180 }))
      .mockResolvedValueOnce(json({ token: 'private-token', user: invalidUser }));
    await expect(checkStoreReviewAuth('https://api.example.test', fetchMock))
      .rejects.toThrow('Review account must have a complete profile and passenger-only access');
  });

  it('rejects an HTML success page in place of the API', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>Home</html>'));
    await expect(checkStoreReviewAuth('https://api.example.test', fetchMock))
      .rejects.toThrow('/health/ready: expected an API JSON response');
  });

  it('does not expose credentials from connection failures', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('private-proxy-credential'));
    await expect(checkStoreReviewAuth('https://api.example.test', fetchMock))
      .rejects.toThrow('/health/ready: connection failed or timed out');
  });
});
