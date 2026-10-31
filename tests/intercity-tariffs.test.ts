import Fastify from 'fastify';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPricingRules } from '../src/domain/pricing';

const mocks = vi.hoisted(() => ({query: vi.fn(), execute: vi.fn(), firstRow: vi.fn(), authenticate: vi.fn()}));
vi.mock('../server/db', () => ({db: {query: mocks.query, execute: mocks.execute}, firstRow: mocks.firstRow}));
vi.mock('../server/security', async original => ({...await original<typeof import('../server/security')>(), authenticate: mocks.authenticate}));
import { registerRoutes } from '../server/routes';

const app = Fastify();
const publish = vi.fn();
let row: Record<string, unknown>;
const fields = ['intercityPerKilometer07To22Minor', 'intercityPerKilometer22To02Minor', 'intercityPerKilometer02To07Minor'] as const;
const oldClientInput = () => {
  const value = {...defaultPricingRules} as Record<string, unknown>;
  for (const field of fields) delete value[field];
  return value;
};
beforeAll(async () => { await registerRoutes(app, publish, {disconnectUser: vi.fn()}); });
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  row = Object.fromEntries(Object.entries(defaultPricingRules).map(([key, value]) => [
    key.replace(/07To22/gu, '_07_22').replace(/22To02/gu, '_22_02').replace(/02To07/gu, '_02_07')
      .replace(/[A-Z]/gu, letter => '_' + letter.toLowerCase()), value,
  ]));
  mocks.authenticate.mockResolvedValue({id: 'admin', roles: ['admin']});
  mocks.firstRow.mockResolvedValue({blocked_at: null});
  mocks.query.mockImplementation(async () => [[{...row}]]);
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.startsWith('UPDATE tariff_settings')) {
      const columns = [...sql.matchAll(/(\w+) = \?/gu)].map(match => match[1]!);
      expect(values).toHaveLength(columns.length);
      columns.forEach((column, index) => { row[column] = values[index]; });
    }
    return [{affectedRows: 1}];
  });
});

describe('intercity tariff settings API', () => {
  it('reads the three approved rates', async () => {
    const response = await app.inject({url: '/v1/admin/tariffs'});
    expect(response.statusCode).toBe(200);
    expect(fields.map(key => response.json().data[key])).toEqual([5000, 7000, 10000]);
  });
  it('saves all three rates, returns them and records the change', async () => {
    const input = {...defaultPricingRules, intercityPerKilometer07To22Minor: 5500, intercityPerKilometer22To02Minor: 7500, intercityPerKilometer02To07Minor: 11000};
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: input});
    expect(response.statusCode).toBe(200);
    expect(fields.map(key => response.json().data[key])).toEqual([5500, 7500, 11000]);
    expect(response.json().data.intercityPerKilometerMinor).toBe(5500);
    const saved = (await app.inject({url: '/v1/admin/tariffs'})).json().data;
    expect(fields.map(key => saved[key])).toEqual([5500, 7500, 11000]);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.any(Array));
    expect(publish).toHaveBeenCalledWith('admins', 'tariffs:updated', expect.objectContaining({intercityPerKilometer22To02Minor: 7500}));
  });
  it('preserves night rates when an older app saves unrelated settings', async () => {
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: {...oldClientInput(), waitingFreeMinutes: 4}});
    expect(response.statusCode).toBe(200);
    expect(fields.map(key => response.json().data[key])).toEqual([5000, 7000, 10000]);
    expect(response.json().data.waitingFreeMinutes).toBe(4);
  });
  it('still applies an explicit flat-rate change from an older app', async () => {
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: {...oldClientInput(), intercityPerKilometerMinor: 6000}});
    expect(response.statusCode).toBe(200);
    expect(fields.map(key => response.json().data[key])).toEqual([6000, 6000, 6000]);
  });
  it('honors the released admin app when it echoes unknown period fields from GET', async () => {
    const loaded = (await app.inject({url: '/v1/admin/tariffs'})).json().data;
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: {...loaded, intercityPerKilometerMinor: 6500}});
    expect(response.statusCode).toBe(200);
    expect(fields.map(key => response.json().data[key])).toEqual([6500, 6500, 6500]);
  });
  it('preserves all period rates when an old app echoes them while changing an unrelated setting', async () => {
    const loaded = (await app.inject({url: '/v1/admin/tariffs'})).json().data;
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: {...loaded, waitingFreeMinutes: 5}});
    expect(response.statusCode).toBe(200);
    expect(fields.map(key => response.json().data[key])).toEqual([5000, 7000, 10000]);
  });
  it.each([
    {...oldClientInput(), intercityPerKilometer07To22Minor: 5000},
    {...defaultPricingRules, intercityPerKilometer22To02Minor: -1},
    {...defaultPricingRules, intercityPerKilometer02To07Minor: 1.5},
    {...defaultPricingRules, intercityPerKilometer02To07Minor: 1_000_001},
  ])('rejects invalid or incomplete periods without saving', async input => {
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: input});
    expect(response.statusCode).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('does not allow a passenger to change rates', async () => {
    mocks.authenticate.mockResolvedValue({id: 'passenger', roles: ['passenger']});
    const response = await app.inject({method: 'PUT', url: '/v1/admin/tariffs', payload: defaultPricingRules});
    expect(response.statusCode).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
