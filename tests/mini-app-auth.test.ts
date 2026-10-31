import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMiniAppLaunch, verifyMaxMiniAppContact } from '../server/mini-app-auth';

const now = 1793420000;
const token = 'isolated-test-token';
function launch(fields: Record<string, string> = {}, secret = token) {
  const params = new URLSearchParams({ auth_date: String(now), user: JSON.stringify({ id: 42, first_name: 'Анна', allows_write_to_pm: true }), ...fields });
  params.sort();
  const key = createHmac('sha256', 'WebAppData').update(secret).digest();
  params.set('hash', createHmac('sha256', key).update([...params].map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
  return params.toString();
}
describe('signed mini app identity', () => {
  it.each(['telegram', 'max'] as const)('verifies %s without rebuilding signed user JSON', provider => {
    const user = '{ "first_name": "Анна", "id": 42, "photo_url": "https:\\/\\/example.test/a" }';
    expect(verifyMiniAppLaunch({ provider, initData: launch({ user }), botToken: token, nowSeconds: now })).toMatchObject({ userId: '42', firstName: 'Анна' });
  });
  it.each([-3601, 61])('rejects expired/future launches (%s seconds)', delta => {
    expect(() => verifyMiniAppLaunch({ provider: 'max', initData: launch({ auth_date: String(now + delta) }), botToken: token, nowSeconds: now })).toThrow();
  });
  it('rejects duplicates, tampering, wrong bot and missing user', () => {
    for (const value of [launch() + '&auth_date=' + now, launch().replace('42', '43'), launch({}, 'other-bot'), launch({ user: 'null' })]) {
      expect(() => verifyMiniAppLaunch({ provider: 'telegram', initData: value, botToken: token, nowSeconds: now })).toThrow();
    }
  });
  it('does not claim a group chat as a private bot dialog', () => {
    const verified = verifyMiniAppLaunch({ provider: 'max', initData: launch({ chat: JSON.stringify({ id: 500, type: 'CHAT' }) }), botToken: token, nowSeconds: now });
    expect(verified.canMessage).toBe(false);
    expect(verified.chatId).toBe('42');
  });
  it('binds the MAX phone proof to the user, phone and freshness', () => {
    const authDate = String(now);
    const hash = createHmac('sha256', token).update(`authDate=${authDate}\nphone=79990000000\nuserId=42`).digest('base64');
    const proof = { phone: '+79990000000', userId: '42', authDate, hash, botToken: token, nowSeconds: now };
    expect(verifyMaxMiniAppContact(proof)).toBe('+79990000000');
    for (const change of [{ userId: '43' }, { phone: '+79990000001' }, { nowSeconds: now + 301 }, { hash: '' }]) {
      expect(() => verifyMaxMiniAppContact({ ...proof, ...change })).toThrow();
    }
  });
});
