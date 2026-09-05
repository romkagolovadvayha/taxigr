import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultGatewaySettings } from '../src/domain/gateway';
import { firstRow } from '../server/db';
import { registerGatewayRoutes } from '../server/gateway-routes';
import { readGatewaySettings, saveGatewaySettings } from '../server/gateway-settings';
import { callTelegramApi } from '../server/telegram-bot';

vi.mock('../server/db', () => ({ firstRow: vi.fn() }));
vi.mock('../server/gateway-settings', () => ({ readGatewaySettings: vi.fn(), saveGatewaySettings: vi.fn() }));
vi.mock('../server/telegram-bot', () => ({ callTelegramApi: vi.fn() }));
vi.mock('../server/telegram-webhook', () => ({ registerTelegramWebhook: vi.fn(), telegramWebhookStatus: vi.fn() }));

const app = Fastify();
registerGatewayRoutes(app, async (request) => {
  if (request.headers.authorization !== 'Bearer admin') {
    throw Object.assign(new Error('Недостаточно прав'), { statusCode: request.headers.authorization ? 403 : 401 });
  }
  return { id: 'superadmin', roles: ['admin'] };
});
afterEach(() => vi.clearAllMocks());

describe('gateway settings admin endpoints', () => {
  beforeEach(() => {
    vi.mocked(firstRow).mockResolvedValue({ user_id: 'superadmin' } as never);
    vi.mocked(readGatewaySettings).mockResolvedValue({
      ...defaultGatewaySettings, proxyPassword: 'private-proxy-password', webhookSecret: 'private-hmac-key',
    });
  });

  it('requires authentication and the current superadmin role for every operation', async () => {
    for (const [method, url] of [
      ['GET', '/v1/admin/gateway-settings'], ['PUT', '/v1/admin/gateway-settings'],
      ['POST', '/v1/admin/gateway-settings/test'], ['GET', '/v1/admin/gateway-settings/telegram'],
      ['POST', '/v1/admin/gateway-settings/telegram'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: { authorization: 'Bearer passenger' } })).statusCode).toBe(403);
      vi.mocked(firstRow).mockResolvedValueOnce(null);
      expect((await app.inject({ method, url, headers: { authorization: 'Bearer admin' } })).statusCode).toBe(403);
    }
    expect(readGatewaySettings).not.toHaveBeenCalled();
    expect(saveGatewaySettings).not.toHaveBeenCalled();
    expect(callTelegramApi).not.toHaveBeenCalled();
  });

  it('returns only secret-presence flags', async () => {
    const response = await app.inject({ url: '/v1/admin/gateway-settings', headers: { authorization: 'Bearer admin' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.hasProxyPassword).toBe(true);
    expect(response.body).not.toContain('private-proxy-password');
    expect(response.body).not.toContain('private-hmac-key');
    expect(response.json().data).not.toHaveProperty('proxyPassword');
  });

  it('rejects an invalid configuration without writing to the database', async () => {
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/gateway-settings',
      headers: { authorization: 'Bearer admin' }, payload: { proxyUrl: 'http://127.0.0.1' } });
    expect(response.statusCode).toBe(400);
    expect(saveGatewaySettings).not.toHaveBeenCalled();
  });

  it('does not expose secrets in an upstream error', async () => {
    vi.mocked(callTelegramApi).mockRejectedValue(new Error('private-proxy-password https://hooks.prostoj.store/relay?sig=private-hmac-key'));
    const response = await app.inject({ method: 'POST', url: '/v1/admin/gateway-settings/test', headers: { authorization: 'Bearer admin' } });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('private-proxy-password');
    expect(response.body).not.toContain('private-hmac-key');
  });
});
