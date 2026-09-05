import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { defaultGatewaySettings } from '../../src/domain/gateway';
import { db } from '../db';
import { gatewayUpdateSchema } from '../gateway';
import { readGatewaySettings, saveGatewaySettings } from '../gateway-settings';

// One-time import of a private gatewayctl project file; never pass secrets as CLI arguments.
try {
  const [credentialsPath, apiPublicUrl] = process.argv.slice(2);
  if (!credentialsPath || !apiPublicUrl) throw new Error('Missing arguments');
  const credentials = z.object({
    project: z.string(), proxy_url: z.string(), proxy_username: z.string(),
    proxy_password: z.string().min(1), webhook_url: z.string(), webhook_secret: z.string().min(1),
  }).parse(JSON.parse(await readFile(credentialsPath, 'utf8')));
  const current = await readGatewaySettings();
  const { hasProxyPassword: _password, hasWebhookSecret: _secret, ...defaults } = defaultGatewaySettings;
  const input = gatewayUpdateSchema.parse({
    ...defaults, revision: current.revision, apiPublicUrl,
    proxyEnabled: true, proxyUrl: credentials.proxy_url,
    proxyUsername: credentials.proxy_username, proxyPassword: credentials.proxy_password,
    webhooksEnabled: true, webhookUrl: credentials.webhook_url,
    project: credentials.project, webhookSecret: credentials.webhook_secret,
  });
  if (current.revision !== 0) {
    const matches = Object.entries(input).every(([key, value]) =>
      key === 'revision' || current[key as keyof typeof current] === value,
    );
    if (!matches) throw new Error('Gateway already configured; use the superadmin panel');
    console.log('The same gateway settings are already stored; no changes made.');
  } else {
    await saveGatewaySettings(input, null);
    console.log('Gateway settings imported into the database.');
  }
} catch {
  console.error('Import failed. Check the private project file, API URL, migrations and that the gateway has not already been configured.');
  process.exitCode = 1;
} finally {
  await db.end();
}
