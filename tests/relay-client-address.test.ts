import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('../server/security', () => ({ verifySession: identity.verify }));
import { relayClientAddress } from '../server/relay-client-address';

beforeEach(() => {
  identity.verify.mockReset().mockImplementation(async (token: string) => {
    if (token === 'a-original' || token === 'a-refreshed') return { id: 'user-a', roles: ['passenger'] };
    if (token === 'b-original') return { id: 'user-b', roles: ['driver'] };
    throw new Error('Invalid signature');
  });
});
describe('authenticated relay rate-limit identity', () => {
  it('keeps refreshed sessions for one user in the same bucket', async () => {
    expect(await relayClientAddress('a-original')).toBe(await relayClientAddress('a-refreshed'));
  });
  it('gives different verified users different valid IPv6 addresses', async () => {
    const first = await relayClientAddress('a-original'), second = await relayClientAddress('b-original');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^fd74:6178(?::[0-9a-f]{4}){6}$/);
  });
  it('cannot split the anonymous limit with forged tokens', async () => {
    expect(await relayClientAddress()).toBe('127.0.0.1');
    expect(await relayClientAddress('forged-a')).toBe('127.0.0.1');
    expect(await relayClientAddress('forged-b')).toBe('127.0.0.1');
  });
  it('does not let one passenger exhaust another passenger rate limit', async () => {
    const app = Fastify();
    try {
      await app.register(rateLimit, { max: 2, timeWindow: '1 minute', keyGenerator: request => request.ip });
      app.get('/limited', async () => ({ ok: true }));
      const first = await relayClientAddress('a-original'), second = await relayClientAddress('b-original');
      const call = (remoteAddress: string) => app.inject({ url: '/limited', remoteAddress });
      expect((await call(first)).statusCode).toBe(200);
      expect((await call(first)).statusCode).toBe(200);
      expect((await call(first)).statusCode).toBe(429);
      expect((await call(second)).statusCode).toBe(200);
      expect((await call(second)).statusCode).toBe(200);
      expect((await call(second)).statusCode).toBe(429);
    } finally { await app.close(); }
  });
});
