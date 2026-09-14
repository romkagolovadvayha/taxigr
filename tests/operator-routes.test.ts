import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerOperatorRoutes } from '../server/operator-routes';
import { readOperatorSettings, saveOperatorSettings } from '../server/operator-settings';
import { defaultOperatorDetails } from '../src/legal/operator';

vi.mock('../server/operator-settings', () => ({ readOperatorSettings: vi.fn(), saveOperatorSettings: vi.fn() }));

const app = Fastify();
registerOperatorRoutes(app, async (request) => {
  if (request.headers.authorization !== 'Bearer admin') {
    throw Object.assign(new Error('Недостаточно прав'), { statusCode: request.headers.authorization ? 403 : 401 });
  }
  return { id: 'admin-id', roles: ['admin'] };
});

const settings = {
  ...defaultOperatorDetails,
  legalName: 'ИП Тестовый Оператор',
  status: 'ИП',
  inn: '012345678901',
  registrationNumber: '012345678901234',
  email: 'operator@example.test',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readOperatorSettings).mockResolvedValue(settings);
  vi.mocked(saveOperatorSettings).mockImplementation(async (input) => input);
});
afterAll(() => app.close());

describe('operator details API', () => {
  it('allows visitors to read current public details without HTTP caching', async () => {
    const response = await app.inject({ url: '/v1/operator-details' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ data: settings });
  });

  it('protects both administrator operations from guests and other roles', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      for (const authorization of [undefined, 'Bearer passenger', 'Bearer driver']) {
        const response = await app.inject({ method, url: '/v1/admin/operator-details',
          headers: authorization ? { authorization } : {}, ...(method === 'PUT' ? { payload: settings } : {}) });
        expect(response.statusCode).toBe(authorization ? 403 : 401);
      }
    }
    expect(readOperatorSettings).not.toHaveBeenCalled();
    expect(saveOperatorSettings).not.toHaveBeenCalled();
  });

  it('normalizes submitted data, preserves leading zeroes, and passes the actor for auditing', async () => {
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/operator-details',
      headers: { authorization: 'Bearer admin' }, payload: { ...settings, legalName: `  ${settings.legalName}  `, inn: ` ${settings.inn} ` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(settings);
    expect(saveOperatorSettings).toHaveBeenCalledWith(settings, 'admin-id', expect.any(String));
  });

  it.each([
    { inn: '123' }, { inn: '12345678901x' }, { registrationNumber: '123' },
    { email: 'not-an-email' }, { legalName: 'a'.repeat(251) },
  ])('rejects invalid details before writing: %j', async (invalid) => {
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/operator-details',
      headers: { authorization: 'Bearer admin' }, payload: { ...settings, ...invalid } });
    expect(response.statusCode).toBe(400);
    expect(saveOperatorSettings).not.toHaveBeenCalled();
  });

  it('allows optional details to be filled later and explicitly cleared', async () => {
    const cleared = { ...settings, inn: '', registrationNumber: '', address: '', phone: '', taxiRegistryNumber: '', email: '' };
    const response = await app.inject({ method: 'PUT', url: '/v1/admin/operator-details',
      headers: { authorization: 'Bearer admin' }, payload: cleared });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(cleared);
  });

  it('reports storage failure and supports retrying the same input', async () => {
    vi.mocked(saveOperatorSettings).mockRejectedValueOnce(new Error('Database unavailable'));
    const request = { method: 'PUT' as const, url: '/v1/admin/operator-details',
      headers: { authorization: 'Bearer admin' }, payload: settings };
    expect((await app.inject(request)).statusCode).toBe(500);
    const retry = await app.inject(request);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual(settings);
  });
});
