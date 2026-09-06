import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { defaultGatewaySettings } from '../src/domain/gateway';
import {
  decryptGatewaySecret, encryptGatewaySecret, gatewayUpdateSchema, mergeGatewaySettings,
  presentGatewaySettings, signedWebhookUrl, telegramWebhookUrl, type GatewayConfiguration,
} from '../server/gateway';

const settings: GatewayConfiguration = {
  ...defaultGatewaySettings, proxyEnabled: true, proxyUsername: 'taxigr', proxyPassword: 'proxy-password',
  webhooksEnabled: true, project: 'taxigr', webhookSecret: '0123456789abcdef', apiPublicUrl: 'https://api.taxigr.ru',
};

describe('Prostoj gateway', () => {
  it('signs the exact target with the text key and LF separators', () => {
    const target = 'https://api.taxigr.ru/hook/a%2Fb?x=one+two&b=%2f&x=last';
    const url = new URL(signedWebhookUrl(target, settings));
    expect(url.origin + url.pathname).toBe('https://hooks.prostoj.store/relay');
    expect(url.searchParams.get('target')).toBe(target);
    expect(url.searchParams.get('v')).toBe('1');
    expect(url.searchParams.get('project')).toBe('taxigr');
    expect(url.searchParams.get('sig')).toBe(createHmac('sha256', '0123456789abcdef')
      .update('prostoj-hooks-v1\ntaxigr\n' + target).digest('hex'));
    expect(url.searchParams.get('sig')).not.toBe(createHmac('sha256', Buffer.from('0123456789abcdef', 'hex'))
      .update('prostoj-hooks-v1\ntaxigr\n' + target).digest('hex'));
  });

  it('uses the public API and switches to a direct URL only when explicitly disabled', () => {
    expect(new URL(telegramWebhookUrl(settings)).searchParams.get('target')).toBe('https://api.taxigr.ru/v1/webhooks/telegram');
    expect(telegramWebhookUrl({ ...settings, webhooksEnabled: false })).toBe('https://api.taxigr.ru/v1/webhooks/telegram');
    expect(() => telegramWebhookUrl({ ...settings, apiPublicUrl: '' })).toThrow();
  });

  it('encrypts secrets with authenticated randomized ciphertext', () => {
    const encrypted = encryptGatewaySecret('private-project-key');
    expect(encrypted).not.toContain('private-project-key');
    expect(encryptGatewaySecret('private-project-key')).not.toBe(encrypted);
    expect(decryptGatewaySecret(encrypted)).toBe('private-project-key');
    expect(() => decryptGatewaySecret(encrypted!.replace(/^v1\./u, 'v2.'))).toThrow();
    const parts = encrypted!.split('.');
    parts[2] = Buffer.alloc(16).toString('base64');
    expect(() => decryptGatewaySecret(parts.join('.'))).toThrow();
    expect(decryptGatewaySecret(encryptGatewaySecret(''))).toBe('');
  });

  it('hides secret values and preserves omitted or empty password fields', () => {
    const view = presentGatewaySettings(settings);
    expect(view.hasProxyPassword).toBe(true);
    expect(view.hasWebhookSecret).toBe(true);
    expect(view).not.toHaveProperty('proxyPassword');
    expect(view).not.toHaveProperty('webhookSecret');
    const { hasProxyPassword: _password, hasWebhookSecret: _secret, ...input } = view;
    const next = mergeGatewaySettings(settings, { ...input, proxyPassword: '', webhookSecret: undefined });
    expect(next.proxyPassword).toBe(settings.proxyPassword);
    expect(next.webhookSecret).toBe(settings.webhookSecret);
    expect(next.revision).toBe(1);
    expect(() => mergeGatewaySettings(settings, { ...input, proxyPassword: null })).toThrow();
    expect(mergeGatewaySettings(settings, { ...input, proxyEnabled: false, proxyPassword: null }).proxyPassword).toBe('');
  });

  it('rejects unsafe addresses and unknown configuration fields', () => {
    const { hasProxyPassword: _password, hasWebhookSecret: _secret, ...input } = presentGatewaySettings(settings);
    for (const proxyUrl of ['not a url', 'https://', 'http://proxy.prostoj.store', 'https://user:pass@proxy.prostoj.store', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://proxy.prostoj.store/path', 'https://proxy.prostoj.store?token=x']) {
      expect(gatewayUpdateSchema.safeParse({ ...input, proxyUrl }).success).toBe(false);
    }
    expect(gatewayUpdateSchema.safeParse({ ...input, adminToken: 'never-store' }).success).toBe(false);
    expect(gatewayUpdateSchema.safeParse(input).success).toBe(true);
    expect(() => mergeGatewaySettings(settings, { ...input, project: '' })).toThrow();
  });
});
