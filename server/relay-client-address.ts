import { createHash } from 'node:crypto';
import { verifySession } from './security';

/** Use only after the caller has authenticated this user. */
export function verifiedUserClientAddress(userId: string): string {
  const digest = createHash('sha256').update(userId).digest('hex').slice(0, 24);
  return `fd74:6178:${digest.match(/.{4}/g)!.join(':')}`;
}

/** Internal injection metadata, never an address supplied by a relay packet. */
export async function relayClientAddress(token?: string): Promise<string> {
  if (token) {
    try {
      const session = await verifySession(token);
      // Refreshes and both messengers share the same per-user rate-limit bucket.
      return verifiedUserClientAddress(session.id);
    } catch { /* Invalid and anonymous sessions share the limited default bucket. */ }
  }
  return '127.0.0.1';
}
