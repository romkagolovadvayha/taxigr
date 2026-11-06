import { createHash } from 'node:crypto';
import { ProxyAgent } from 'undici';

import type { GatewayConfiguration } from './gateway';
import { readGatewaySettings } from './gateway-settings';

type ProxySettings = Pick<GatewayConfiguration, 'proxyEnabled' | 'proxyUrl' | 'proxyUsername' | 'proxyPassword'>;
type ProxyScope = 'telegram' | 'booking-ai';
const agents = new Map<ProxyScope, { key: string; agent: ProxyAgent }>();

export function gatewayDispatcher(
  settings: ProxySettings,
  { scope = 'telegram', servername }: { scope?: ProxyScope; servername?: string } = {},
): ProxyAgent | undefined {
  const key = settings.proxyEnabled
    ? createHash('sha256').update(JSON.stringify([settings.proxyUrl, settings.proxyUsername, settings.proxyPassword, servername])).digest('hex')
    : '';
  const previous = agents.get(scope);
  if (previous?.key === key) return previous.agent;
  const next = key ? {
    key,
    agent: new ProxyAgent({
      uri: settings.proxyUrl,
      token: `Basic ${Buffer.from(`${settings.proxyUsername}:${settings.proxyPassword}`).toString('base64')}`,
      ...(servername ? { proxyTls: { servername } } : {}),
    }),
  } : undefined;
  if (next) agents.set(scope, next);
  else agents.delete(scope);
  // Drain in-flight requests without delaying a settings change.
  void previous?.agent.close().catch(() => undefined);
  return next?.agent;
}

export async function telegramDispatcher(): Promise<ProxyAgent | undefined> {
  return gatewayDispatcher(await readGatewaySettings());
}

export async function closeGatewayDispatcher(): Promise<void> {
  const current = Array.from(agents.values());
  agents.clear();
  await Promise.all(current.map(({ agent }) => agent.close()));
}
