import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { appStores, parsePublishedRelease, type AppReleaseManifest } from '../src/domain/app-updates';

export const appReleaseManifestUrl = new URL('./app-releases.json', import.meta.url);

export function registerAppReleaseRoutes(
  app: FastifyInstance,
  readManifest: () => Promise<unknown> = async () => JSON.parse(await readFile(appReleaseManifestUrl, 'utf8')),
): void {
  app.get('/v1/app-releases', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      const raw = await readManifest() as Partial<AppReleaseManifest> | null;
      if (raw?.schemaVersion !== 1 || !raw.releases) throw new Error('Invalid app release manifest');
      const releases = {} as AppReleaseManifest['releases'];
      for (const store of appStores) {
        const value = raw.releases[store];
        const release = parsePublishedRelease(value, store);
        if (value != null && !release) throw new Error(`Invalid published release for ${store}`);
        releases[store] = release && Date.parse(release.publishedAt) <= Date.now() ? release : null;
      }
      return { data: { schemaVersion: 1, releases } satisfies AppReleaseManifest };
    } catch (error) {
      app.log.warn({ err: error }, 'Cannot read published app releases');
      return reply.code(503).send({ error: { code: 'APP_RELEASES_UNAVAILABLE', message: 'Проверка обновлений временно недоступна' } });
    }
  });
}
