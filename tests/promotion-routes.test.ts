import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstRow } from '../server/db';
import { registerPromotionRoutes } from '../server/promotion-routes';
import { readPromotionSettings, savePromotionSettings } from '../server/promotion-settings';
import { defaultFirstOrderPromotionSettings } from '../src/domain/first-order-discount';

vi.mock('../server/db', () => ({ firstRow: vi.fn() }));
vi.mock('../server/promotion-settings', async original => ({
  ...await original<typeof import('../server/promotion-settings')>(),
  readPromotionSettings: vi.fn(), savePromotionSettings: vi.fn(),
}));
const app = Fastify();
registerPromotionRoutes(app, async request => {
  if (request.headers.authorization !== 'Bearer admin') throw Object.assign(new Error('Forbidden'), {
    statusCode: request.headers.authorization ? 403 : 401,
  });
  return { id: 'admin-id', roles: ['admin'] };
});
const headers = { authorization: 'Bearer admin' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(firstRow).mockResolvedValue({ user_id: 'admin-id' } as never);
  vi.mocked(readPromotionSettings).mockResolvedValue(defaultFirstOrderPromotionSettings);
  vi.mocked(savePromotionSettings).mockImplementation(async input => input);
});
afterAll(() => app.close());

describe('superadmin promotion settings', () => {
  it('requires authentication and rechecks the stored superadmin role for reading and writing', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      for (const authorization of [undefined, 'Bearer passenger', 'Bearer driver']) {
        const result = await app.inject({ method, url: '/v1/admin/promotion-settings',
          headers: authorization ? { authorization } : {}, ...(method === 'PUT' ? { payload: defaultFirstOrderPromotionSettings } : {}) });
        expect(result.statusCode).toBe(authorization ? 403 : 401);
      }
      vi.mocked(firstRow).mockResolvedValueOnce(null);
      expect((await app.inject({ method, url: '/v1/admin/promotion-settings', headers,
        ...(method === 'PUT' ? { payload: defaultFirstOrderPromotionSettings } : {}) })).statusCode).toBe(403);
    }
    expect(readPromotionSettings).not.toHaveBeenCalled();
    expect(savePromotionSettings).not.toHaveBeenCalled();
  });
  it('reads saved settings without caching', async () => {
    const response = await app.inject({ url: '/v1/admin/promotion-settings', headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().data).toEqual(defaultFirstOrderPromotionSettings);
  });
  it.each(['Ваша скидка {discount}%', '{discount}% и {discount}%', 'Акция на первый заказ', ''])('persists the exact template %j with its audit actor', async messageTemplate => {
    const payload = { discountPercent: 20, messageTemplate };
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/promotion-settings', headers, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(payload);
    expect(savePromotionSettings).toHaveBeenCalledWith(payload, 'admin-id', expect.any(String));
  });
  it.each([
    { discountPercent: -1 }, { discountPercent: 101 }, { discountPercent: 20.5 }, { discountPercent: '20' },
    { messageTemplate: 'a'.repeat(601) }, { displayDiscountPercent: 40 },
  ])('rejects invalid settings without saving %j', async invalid => {
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/promotion-settings', headers,
      payload: { ...defaultFirstOrderPromotionSettings, ...invalid } })).statusCode).toBe(400);
    expect(savePromotionSettings).not.toHaveBeenCalled();
  });
  it('permits zero to disable the promotion and retries a failed save', async () => {
    const payload = { ...defaultFirstOrderPromotionSettings, discountPercent: 0 };
    vi.mocked(savePromotionSettings).mockRejectedValueOnce(new Error('Database unavailable'));
    const request = { method: 'PUT' as const, url: '/v1/admin/promotion-settings', headers, payload };
    expect((await app.inject(request)).statusCode).toBe(500);
    expect((await app.inject(request)).json().data).toEqual(payload);
  });
});
