import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), transaction: vi.fn() }));
vi.mock('../server/security', () => ({ authenticate: mocks.authenticate }));
vi.mock('../server/db', () => ({ withTransaction: mocks.transaction }));
import { registerAccountDeletion } from '../server/account-deletion';

describe('account deletion', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue({ id: 'own-user', roles: ['passenger'] }); });

  async function run({ role = 'passenger', active = false, driver = false, confirmed = true, denied = false } = {}) {
    mocks.authenticate.mockResolvedValue({ id: 'own-user', roles: ['passenger'] });
    const writes: { sql: string; values: unknown[] }[] = [];
    const connection = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM users')) return [[{ phone: '+79990000111' }]];
        if (sql.includes('FROM user_roles')) return [[{ role }]];
        if (sql.includes('FROM drivers')) return [driver ? [{ id: 'own-driver' }] : []];
        if (sql.includes('FROM orders')) return [active ? [{ id: 'active-order' }] : []];
        throw new Error('Unexpected query');
      }),
      execute: vi.fn(async (sql: string, values: unknown[]) => { writes.push({ sql, values }); return [{}]; }),
    };
    mocks.transaction.mockImplementation(async (work) => work(connection));
    if (denied) mocks.authenticate.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const disconnect = vi.fn();
    const app = Fastify();
    registerAccountDeletion(app, disconnect);
    const result = await app.inject({ method: 'DELETE', url: '/v1/me', payload: { confirmation: confirmed ? 'DELETE_ACCOUNT' : 'wrong' } });
    await app.close();
    return { result, writes, disconnect, connection };
  }

  it('requires an authenticated, explicitly confirmed request', async () => {
    expect((await run({ denied: true })).result.statusCode).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect((await run({ confirmed: false })).result.statusCode).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('keeps the account and trip untouched while an order is active', async () => {
    const { result, writes, disconnect } = await run({ active: true });
    expect(result.statusCode).toBe(409);
    expect(writes).toHaveLength(0);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('requires an administrator to transfer access before deletion', async () => {
    const { result, writes } = await run({ role: 'admin' });
    expect(result.statusCode).toBe(409);
    expect(writes).toHaveLength(0);
  });

  it('removes only the caller identity and sessions while retaining historical trips', async () => {
    const { result, writes, disconnect } = await run();
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ data: { deleted: true } });
    expect(writes.find(w => w.sql.startsWith('UPDATE users'))).toMatchObject({ values: ['own-user'] });
    expect(writes.some(w => /DELETE FROM orders|UPDATE orders/.test(w.sql))).toBe(false);
    for (const table of ['session_codes', 'push_tokens', 'web_push_subscriptions', 'user_messenger_accounts']) {
      expect(writes).toContainEqual({ sql: `DELETE FROM ${table} WHERE user_id = ?`, values: ['own-user'] });
    }
    expect(disconnect).toHaveBeenCalledWith('own-user');
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'READ COMMITTED' });
  });

  it('takes an idle driver off line and revokes their location and active cars', async () => {
    const { result, writes } = await run({ driver: true });
    expect(result.statusCode).toBe(200);
    expect(writes).toContainEqual({ sql: "UPDATE drivers SET status = 'suspended' WHERE id = ?", values: ['own-driver'] });
    expect(writes).toContainEqual({ sql: 'DELETE FROM driver_locations WHERE driver_id = ?', values: ['own-driver'] });
    expect(writes).toContainEqual({ sql: 'UPDATE vehicles SET active = FALSE WHERE driver_id = ?', values: ['own-driver'] });
  });
});
