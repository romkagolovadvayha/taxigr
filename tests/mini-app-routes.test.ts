import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMiniAppRoutes } from '../server/mini-app-routes';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), find: vi.fn(), create: vi.fn(), link: vi.fn(), consent: vi.fn(), sign: vi.fn() }));
vi.mock('../server/config', () => ({ config: { MAX_BOT_TOKEN: 'max-test', TELEGRAM_BOT_TOKEN: 'telegram-test' } }));
vi.mock('../server/db', () => ({ db: { execute: mocks.execute }, withTransaction: (work: (connection: unknown) => unknown) => work({ query: mocks.query, execute: mocks.execute }) }));
vi.mock('../server/repositories', () => ({ findUserWithRoles: mocks.find, findOrCreatePhoneUser: mocks.create, linkMessengerIdentity: mocks.link }));
vi.mock('../server/legal', () => ({ hasCurrentInitialConsents: mocks.consent }));
vi.mock('../server/security', () => ({ signSession: mocks.sign }));
const app = Fastify();
beforeAll(() => registerMiniAppRoutes(app));
afterAll(() => app.close());
beforeEach(() => {
  vi.resetAllMocks(); mocks.query.mockResolvedValue([[]]); mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  mocks.create.mockResolvedValue('passenger'); mocks.find.mockResolvedValue({ id: 'passenger', roles: ['passenger'], name: 'Анна', phone: '+79990000000', profileComplete: true });
  mocks.consent.mockResolvedValue(false); mocks.sign.mockResolvedValue('session-token');
});
function signed(provider: string) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":42,"first_name":"Анна"}' });
  params.sort();
  const key = createHmac('sha256', 'WebAppData').update(`${provider}-test`).digest();
  params.set('hash', createHmac('sha256', key).update([...params].map(([k,v]) => `${k}=${v}`).join('\n')).digest('hex'));
  return params.toString();
}
const post = (provider: string, extra = {}) => app.inject({ method: 'POST', url: `/v1/auth/mini-app/${provider}`, payload: { initData: signed(provider), ...extra } });
describe('embedded passenger authentication', () => {
  it.each(['max', 'telegram'])('requires a verified phone for a new %s passenger', async provider => {
    const response = await post(provider);
    expect(response.json()).toEqual({ data: { status: 'phone_required' } });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it.each(['max', 'telegram'])('reopens the existing %s account and keeps legal consent pending', async provider => {
    mocks.query.mockResolvedValue([[{ user_id: 'passenger', phone: '+79990000000', chat_id: '42', bot_contact_available: 1 }]]);
    const response = await post(provider);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ status: 'verified', legalConsentRequired: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sign).toHaveBeenCalledWith({ id: 'passenger', roles: ['passenger'] });
  });
  it('never accepts a Telegram phone from browser input', async () => {
    expect((await post('telegram', { contact: { phone: '+79990000000', authDate: '123', hash: 'forged' } })).statusCode).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('accepts an owned webhook proof and consumes its request', async () => {
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    mocks.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ verified_phone: '+79990000000' }]]);
    expect((await post('telegram', { contactRequestId: requestId })).json().data.status).toBe('verified');
    expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('consumed_at IS NULL'), ['42', requestId]);
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), '+79990000000');
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining('consumed_at ='), ['42', requestId]);
  });
  it('does not authenticate a missing/expired/consumed Telegram proof', async () => {
    expect((await post('telegram', { contactRequestId: '123e4567-e89b-42d3-a456-426614174000' })).json().data.status).toBe('phone_required');
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('blocks disabled profiles', async () => {
    mocks.query.mockResolvedValue([[{ user_id: 'passenger', phone: '+79990000000' }]]);
    mocks.find.mockResolvedValue({ id: 'passenger', blockedAt: new Date().toISOString() });
    expect((await post('max')).statusCode).toBe(403); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rejects an unsigned launch before touching the database', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/auth/mini-app/max', payload: { initData: 'user=42' } })).statusCode).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(['max', 'telegram'])('reuses the phone just verified in the %s bot for the same signed identity', async provider => {
    mocks.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ verified_phone: '+79990000000' }]]);
    expect((await post(provider)).json().data.status).toBe('verified');
    expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining(`FROM ${provider}_auth_challenges`), ['42']);
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), '+79990000000');
  });
});
