import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../server/routes';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), firstRow: vi.fn(), authenticate: vi.fn(), profile: vi.fn(), notify: vi.fn() }));
vi.mock('../server/db', () => ({
  db: { query: mocks.query, execute: mocks.execute }, firstRow: mocks.firstRow,
  withTransaction: (work: (connection: unknown) => unknown) => work({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('../server/security', async original => ({ ...await original<typeof import('../server/security')>(), authenticate: mocks.authenticate }));
vi.mock('../server/driver-profile-edit', async original => ({ ...await original<typeof import('../server/driver-profile-edit')>(), updateAdminDriverProfile: mocks.profile }));
vi.mock('../server/messenger-notifications', async original => ({ ...await original<typeof import('../server/messenger-notifications')>(), notifyDriversInMessengers: mocks.notify }));
const app = Fastify();
const publish = vi.fn();
const id = '9e670707-8f07-4701-8d44-7cd3ecc09f84';
beforeAll(async () => { await registerRoutes(app, publish, { disconnectUser: vi.fn() }); });
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ id: 'admin', roles: ['admin'] });
  mocks.firstRow.mockResolvedValue({ blocked_at: null });
  mocks.profile.mockResolvedValue({ id, userId: 'driver-user' });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  mocks.query.mockImplementation(async (sql: string) => [sql.includes('FROM drivers d JOIN users u')
    ? [{ status: 'online', commission_bps: null, blocked_at: null, priority_grahovo: 0, priority_district: 0, priority_intercity: 0 }] : []]);
  mocks.notify.mockResolvedValue(undefined);
});

describe('silent administrative driver changes', () => {
  it('saves the profile and updates live clients without a personal message', async () => {
    const response = await app.inject({ method: 'PATCH', url: `/v1/admin/drivers/${id}/profile`, payload: { hasSezPass: true } });
    expect(response.statusCode).toBe(200);
    expect(mocks.profile).toHaveBeenCalledWith(id, { hasSezPass: true }, 'admin', expect.any(String));
    expect(publish).toHaveBeenCalledWith('user:driver-user', 'profile:updated', { id: 'driver-user' });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each([
    { commissionBps: 500 }, { commissionBps: null },
    { priorities: { grahovo: true, district: false, intercity: true } },
    { status: 'offline' }, { status: 'suspended' },
  ])('persists and audits administrative settings without notifying the driver: %j', async payload => {
    const response = await app.inject({ method: 'PATCH', url: `/v1/admin/drivers/${id}`, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ id, ...payload });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE drivers SET status'), expect.any(Array));
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin', 'driver.update']));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('denies a driver access to administrator changes', async () => {
    mocks.authenticate.mockResolvedValue({ id: 'driver-user', roles: ['driver'] });
    const response = await app.inject({ method: 'PATCH', url: `/v1/admin/drivers/${id}`, payload: { commissionBps: 500 } });
    expect(response.statusCode).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
