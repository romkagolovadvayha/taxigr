import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBookingRoutes } from '../server/booking-routes';
import { readBookingSettings, saveBookingSettings } from '../server/booking-settings';

vi.mock('../server/booking-settings', () => ({ readBookingSettings: vi.fn(), saveBookingSettings: vi.fn() }));
const app = Fastify();
registerBookingRoutes(app, async (request) => {
  if (request.headers.authorization !== 'Bearer admin') throw Object.assign(new Error('Forbidden'), { statusCode: request.headers.authorization ? 403 : 401 });
  return { id: 'admin-id', roles: ['admin'] };
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readBookingSettings).mockResolvedValue({ enabled: false });
  vi.mocked(saveBookingSettings).mockImplementation(async (input) => input);
});
afterAll(() => app.close());

describe('booking availability API', () => {
  it('exposes the disabled state publicly without caching', async () => {
    const response = await app.inject({ url: '/v1/booking-availability' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ data: { enabled: false } });
  });
  it('protects admin reads and writes from guests, passengers and drivers', async () => {
    for (const method of ['GET', 'PUT'] as const) for (const authorization of [undefined, 'Bearer passenger', 'Bearer driver']) {
      const response = await app.inject({ method, url: '/v1/admin/booking-settings', headers: authorization ? { authorization } : {},
        ...(method === 'PUT' ? { payload: { enabled: true } } : {}) });
      expect(response.statusCode).toBe(authorization ? 403 : 401);
    }
    expect(readBookingSettings).not.toHaveBeenCalled();
    expect(saveBookingSettings).not.toHaveBeenCalled();
  });
  it.each([true, false])('saves %s with the audit actor', async (enabled) => {
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/booking-settings', headers: { authorization: 'Bearer admin' }, payload: { enabled } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { enabled } });
    expect(saveBookingSettings).toHaveBeenCalledWith({ enabled }, 'admin-id', expect.any(String));
  });
  it.each([{}, { enabled: 'false' }, { enabled: 1 }, { enabled: null }, { enabled: true, surprise: true }])('rejects invalid flag %j', async (payload) => {
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/booking-settings', headers: { authorization: 'Bearer admin' }, payload });
    expect(response.statusCode).toBe(400);
    expect(saveBookingSettings).not.toHaveBeenCalled();
  });
  it('reports a failed save and accepts a retry', async () => {
    vi.mocked(saveBookingSettings).mockRejectedValueOnce(new Error('Database unavailable'));
    const request = { method: 'PUT' as const, url: '/v1/admin/booking-settings', headers: { authorization: 'Bearer admin' }, payload: { enabled: true } };
    expect((await app.inject(request)).statusCode).toBe(500);
    expect((await app.inject(request)).statusCode).toBe(200);
  });
});
