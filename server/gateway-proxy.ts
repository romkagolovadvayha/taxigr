import { createHash } from 'node:crypto';
import { ProxyAgent } from 'undici';

import type { GatewayConfiguration } from './gateway';
import { readGatewaySettings } from './gateway-settings';

let cached: { key: string; agent: ProxyAgent } | undefined;

export function gatewayDispatcher(settings: GatewayConfiguration): ProxyAgent | undefined {
  const key = settings.proxyEnabled
    ? createHash('sha256').update(JSON.stringify([settings.proxyUrl, settings.proxyUsername, settings.proxyPassword])).digest('hex')
    : '';
  if (cached?.key === key) return cached.agent;
  const previous = cached;
  cached = key ? {
    key,
    agent: new ProxyAgent({
      uri: settings.proxyUrl,
      token: `Basic ${Buffer.from(`${settings.proxyUsername}:${settings.proxyPassword}`).toString('base64')}`,
    }),
  } : undefined;
  // Drain in-flight requests without delaying a settings change.
  void previous?.agent.close().catch(() => undefined);
  return cached?.agent;
}

export async function telegramDispatcher(): Promise<ProxyAgent | undefined> {
  return gatewayDispatcher(await readGatewaySettings());
}

export async function closeGatewayDispatcher(): Promise<void> {
  const previous = cached;
  cached = undefined;
  await previous?.agent.close();
}
