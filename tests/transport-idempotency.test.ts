import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: new Map<string, { fingerprint: string; status_code: number | null; response_body: string | null }>(),
  authenticate: vi.fn(),
}));
vi.mock('../server/security', () => ({ authenticate: state.authenticate }));
vi.mock('../server/db', () => ({ db: {
  execute: async (sql: string, values: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const key = String(values[0]);
      if (state.rows.has(key)) return [{ affectedRows: 0 }];
      state.rows.set(key, { fingerprint: String(values[1]), status_code: null, response_body: null });
      return [{ affectedRows: 1 }];
    }
    const row = state.rows.get(String(values[2]));
    if (row) { row.status_code = Number(values[0]); row.response_body = String(values[1]); }
    return [{ affectedRows: 1 }];
  },
  query: async (_sql: string, values: unknown[]) => [[state.rows.get(String(values[0]))].filter(Boolean)],
} }));

let app: FastifyInstance;
let actions = 0;
const headers = { 'content-type': 'application/json', authorization: 'Bearer taxi-session', 'x-taxi-request-id': 'test-transport-operation-1234' };
beforeEach(async () => {
  state.rows.clear(); state.authenticate.mockReset().mockResolvedValue({ id: 'test-user' }); actions = 0;
  app = Fastify();
  const { registerTransportIdempotency } = await import('../server/transport-idempotency');
  registerTransportIdempotency(app);
  app.post('/v1/action', async () => { const number = ++actions; await new Promise(resolve => setTimeout(resolve, 20)); return { data: { number } }; });
});
afterEach(async () => { await app.close(); });

describe('transport operation replay', () => {
  it('recalculates quotes without writing mutation replay records', async () => {
    app.post('/v1/quotes', async () => ({ data: { priceMinor: ++actions * 10000 } }));
    const first = await app.inject({ method: 'POST', url: '/v1/quotes', headers, payload: '{}' });
    const second = await app.inject({ method: 'POST', url: '/v1/quotes', headers, payload: '{}' });
    expect(first.json().data.priceMinor).toBe(10000);
    expect(second.json().data.priceMinor).toBe(20000);
    expect(state.rows.size).toBe(0);
  });
  it('does not store read-only batch envelopes as replayable mutations', async () => {
    app.post('/v1/transport/read-batch',async()=>({data:{number:++actions}}));
    const first=await app.inject({method:'POST',url:'/v1/transport/read-batch',headers,payload:'{}'});
    const second=await app.inject({method:'POST',url:'/v1/transport/read-batch',headers,payload:'{}'});
    expect(first.json().data.number).toBe(1);expect(second.json().data.number).toBe(2);expect(state.rows.size).toBe(0);
  });
  it('runs concurrent copies of one operation only once', async () => {
    const [primary, fallback] = await Promise.all([app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{}' }), app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{}' })]);
    expect(primary.statusCode).toBe(200); expect(fallback.statusCode).toBe(200);
    expect(primary.json()).toEqual(fallback.json()); expect(actions).toBe(1);
  });
  it('rejects reuse of an operation ID with a different body', async () => {
    await app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{}' });
    const conflict = await app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{"changed":true}' });
    expect(conflict.statusCode).toBe(409); expect(actions).toBe(1);
  });
  it('keeps different sessions separate', async () => {
    await app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{}' });
    await app.inject({ method: 'POST', url: '/v1/action', headers: { ...headers, authorization: 'Bearer another-user' }, payload: '{}' });
    expect(actions).toBe(2);
  });
  it('does not extend an invalidated session with a stored response', async () => {
    await app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{}' });
    state.authenticate.mockRejectedValue(Object.assign(new Error('Expired session'), { statusCode: 401 }));
    const response = await app.inject({ method: 'POST', url: '/v1/action', headers, payload: '{}' });
    expect(response.statusCode).toBe(401); expect(actions).toBe(1);
  });
});
