import { describe, expect, it } from 'vitest';

import { pkceChallenge, randomToken, signSession, verifySession } from '../server/security';

describe('authentication security', () => {
  it('creates URL-safe state and PKCE values', () => {
    const verifier = randomToken(64);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('round-trips a signed role session', async () => {
    const token = await signSession({ id: 'user-test', roles: ['passenger', 'driver'] });
    await expect(verifySession(token)).resolves.toEqual({
      id: 'user-test',
      roles: ['passenger', 'driver'],
    });
  });
});
