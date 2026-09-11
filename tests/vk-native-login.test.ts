import type { PoolConnection } from 'mysql2/promise';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmVkNativeLogin } from '../server/vk-native-login';
import { parseVkNativeLoginState, vkNativeLoginCode, vkNativeLoginUrl } from '../src/vk-mini-app/native-login';

const state = 'aBC123' + 'x'.repeat(37);
const input = { state, sessionUserId: 'taxi-user', vkUserId: '42' };
const query = vi.fn();
const execute = vi.fn();
const connection = { query, execute } as unknown as PoolConnection;
const challenge = () => ({
  id: 'challenge-id', expected_phone: null, vk_user_id: null,
  expires_at: new Date(Date.now() + 60_000), verified_at: null,
  completed_at: null, failure_code: null,
});
const account = { phone: '+79990000000', first_name: 'Иван', last_name: 'Иванов' };

beforeEach(() => { vi.resetAllMocks(); });

describe('VK Android login links', () => {
  it('round trips the state through the Mini App hash and displays the same pairing code', () => {
    const url = new URL(vkNativeLoginUrl('54638428', state));
    expect(url.origin + url.pathname).toBe('https://vk.com/app54638428');
    expect(parseVkNativeLoginState(url.hash)).toBe(state);
    expect(vkNativeLoginCode(state)).toBe('ABC123');
    expect(url.search).toBe('');
    expect(url.href).not.toContain('exchangeToken');
  });
  it.each(['', '#native_auth=short', `#native_auth=${state}&native_auth=${state}`, '#other=value'])(
    'ignores invalid or ambiguous state %s', (hash) => {
      expect(parseVkNativeLoginState(hash)).toBeNull();
    },
  );
});

describe('signed VK session approves only the pending Android challenge', () => {
  it('uses the phone linked to the authenticated VK account and does not issue a token', async () => {
    query.mockResolvedValueOnce([[challenge()]]).mockResolvedValueOnce([[account]]);

    await expect(confirmVkNativeLogin(connection, input)).resolves.toBeUndefined();

    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), [state]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('account.external_user_id = ?'), ['taxi-user', '42']);
    expect(execute).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('UPDATE vk_auth_challenges'),
      [account.phone, '42', 'Иван', 'Иванов', 'challenge-id']);
  });
  it.each([
    null,
    { expires_at: new Date(Date.now() - 1) },
    { completed_at: new Date() },
    { failure_code: 'VK_OAUTH_FAILED' },
    { verified_at: new Date(), vk_user_id: 'other-vk-user' },
  ])('rejects missing, expired or completed/reassigned challenges %j', async (override) => {
    query.mockResolvedValueOnce([override === null ? [] : [{ ...challenge(), ...override }]]);

    await expect(confirmVkNativeLogin(connection, input)).rejects.toHaveProperty('code', 'VK_NATIVE_LOGIN_INVALID');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([[[]], [[{ ...account, phone: null }]]])('rejects an unlinked, blocked/deleted or phone-less session', async (accounts) => {
    query.mockResolvedValueOnce([[challenge()]]).mockResolvedValueOnce([accounts]);

    await expect(confirmVkNativeLogin(connection, input)).rejects.toHaveProperty('statusCode', 403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps an explicit phone constraint from older clients', async () => {
    query.mockResolvedValueOnce([[{ ...challenge(), expected_phone: '+79991111111' }]])
      .mockResolvedValueOnce([[account]]);

    await expect(confirmVkNativeLogin(connection, input)).rejects.toHaveProperty('statusCode', 403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('allows an idempotent confirmation retry by the same verified VK account', async () => {
    query.mockResolvedValueOnce([[{ ...challenge(), verified_at: new Date(), vk_user_id: '42' }]])
      .mockResolvedValueOnce([[account]]);

    await expect(confirmVkNativeLogin(connection, input)).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
