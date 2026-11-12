import { db } from '../db';

try {
  // Import new entry points with exactly the dependency layout used in a release.
  await Promise.all([
    import('../bot-api-relay'), import('../max-api-relay'), import('../vk-api-relay'),
    import('../transport-idempotency'), import('../read-batch'), import('../publish-events'),
  ]);
  console.log('API runtime dependencies verified.');
} finally { await db.end(); }
