import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';

import type { GatewaySettings, GatewaySettingsView } from '../src/domain/gateway';
import { config } from './config';

export type GatewayConfiguration = GatewaySettings & {
  revision: number;
  proxyPassword: string;
  webhookSecret: string;
};

function publicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.search && !url.hash && ['', '443', '8443'].includes(url.port) &&
      !isIP(url.hostname.replace(/^\[|\]$/gu, '')) && url.hostname.includes('.') &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/iu.test(url.hostname);
  } catch {
    return false;
  }
}

const httpsUrl = z.string().trim().max(2_000).refine(publicHttpsUrl, 'Укажите публичный HTTPS-адрес без параметров и пароля');
const fields = {
  proxyEnabled: z.boolean(),
  proxyUrl: httpsUrl.refine((value) => new URL(value).pathname === '/', 'У адреса прокси не должно быть пути'),
  proxyUsername: z.string().trim().max(128).regex(/^[A-Za-z0-9_-]*$/u),
  webhooksEnabled: z.boolean(),
  webhookUrl: httpsUrl,
  project: z.string().trim().max(64).regex(/^(?:[a-z0-9][a-z0-9_-]{1,63})?$/u),
  apiPublicUrl: httpsUrl.or(z.literal('')),
};

export const gatewayUpdateSchema = z.object({
  ...fields,
  revision: z.number().int().min(0),
  // Empty/omitted values retain saved secrets; null explicitly removes them.
  proxyPassword: z.string().min(0).max(512).regex(/^[^\r\n\0]*$/u).nullable().optional(),
  webhookSecret: z.string().min(0).max(512).regex(/^[^\r\n\0]*$/u).nullable().optional(),
}).strict();

export type GatewayUpdate = z.infer<typeof gatewayUpdateSchema>;

export function validateGatewayConfiguration(settings: GatewayConfiguration): void {
  z.object(fields).parse(settings);
  if (settings.proxyEnabled && (!settings.proxyUsername || !settings.proxyPassword)) {
    throw Object.assign(new Error('Заполните логин и пароль прокси'), { statusCode: 400, code: 'GATEWAY_INCOMPLETE' });
  }
  if (settings.webhooksEnabled && (!settings.project || !settings.webhookSecret || !settings.apiPublicUrl)) {
    throw Object.assign(new Error('Заполните проект, ключ вебхуков и публичный адрес API'), { statusCode: 400, code: 'GATEWAY_INCOMPLETE' });
  }
}

export function presentGatewaySettings(settings: GatewayConfiguration): GatewaySettingsView {
  return {
    proxyEnabled: settings.proxyEnabled,
    proxyUrl: settings.proxyUrl,
    proxyUsername: settings.proxyUsername,
    webhooksEnabled: settings.webhooksEnabled,
    webhookUrl: settings.webhookUrl,
    project: settings.project,
    apiPublicUrl: settings.apiPublicUrl,
    revision: settings.revision,
    hasProxyPassword: Boolean(settings.proxyPassword),
    hasWebhookSecret: Boolean(settings.webhookSecret),
  };
}

export function mergeGatewaySettings(before: GatewayConfiguration, input: GatewayUpdate): GatewayConfiguration {
  const next = {
    ...input,
    proxyPassword: input.proxyPassword === null ? '' : input.proxyPassword || before.proxyPassword,
    webhookSecret: input.webhookSecret === null ? '' : input.webhookSecret || before.webhookSecret,
    revision: before.revision + 1,
  };
  validateGatewayConfiguration(next);
  return next;
}

export function signedWebhookUrl(target: string, settings: GatewayConfiguration): string {
  if (!settings.webhooksEnabled) return target;
  validateGatewayConfiguration(settings);
  const signature = createHmac('sha256', settings.webhookSecret)
    .update(`prostoj-hooks-v1\n${settings.project}\n${target}`, 'utf8')
    .digest('hex');
  return `${settings.webhookUrl}?${new URLSearchParams({
    v: '1', project: settings.project, target, sig: signature,
  })}`;
}

export function telegramWebhookUrl(settings: GatewayConfiguration): string {
  if (!settings.apiPublicUrl) {
    throw Object.assign(new Error('Укажите публичный адрес API в настройках прокси'), { statusCode: 400, code: 'GATEWAY_INCOMPLETE' });
  }
  return signedWebhookUrl(`${settings.apiPublicUrl.replace(/\/+$/u, '')}/v1/webhooks/telegram`, settings);
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(`taxigr-gateway-secrets-v1\0${config.JWT_SECRET}`).digest();
}

export function encryptGatewaySecret(value: string): string | null {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptGatewaySecret(value: string | null): string {
  if (!value) return '';
  try {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Не удалось расшифровать настройки шлюза. Восстановите ключ сервера или повторно настройте шлюз.');
  }
}
