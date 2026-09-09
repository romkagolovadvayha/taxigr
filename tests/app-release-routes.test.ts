import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAppReleaseRoutes } from '../server/app-releases';

describe('public app release endpoint', () => {
  it('returns independently published store versions without login or cache', async () => {
    const app = Fastify();
    registerAppReleaseRoutes(app, async () => ({ schemaVersion: 1, releases: {
      rustore: { version: '1.0.11', build: '31', publishedAt: '2026-01-01T00:00:00Z' },
      'google-play': null, 'app-store': null,
    } }));
    const response = await app.inject('/v1/app-releases');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().data.releases).toMatchObject({ rustore: { build: '31' }, 'google-play': null, 'app-store': null });
    await app.close();
  });

  it('does not advertise future scheduled releases', async () => {
    const app = Fastify();
    registerAppReleaseRoutes(app, async () => ({ schemaVersion: 1, releases: {
      rustore: { version: '1.0.11', build: '31', publishedAt: '2099-01-01T00:00:00Z' },
    } }));
    expect((await app.inject('/v1/app-releases')).json().data.releases.rustore).toBeNull();
    await app.close();
  });

  it('fails safely on a malformed registry', async () => {
    const app = Fastify();
    registerAppReleaseRoutes(app, async () => ({ schemaVersion: 1, releases: { rustore: { version: 'pending' } } }));
    const response = await app.inject('/v1/app-releases');
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('APP_RELEASES_UNAVAILABLE');
    await app.close();
  });
});
