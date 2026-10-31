import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ register: vi.fn(), api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiRequest: mocks.api }));
vi.mock('@/notifications/push-registration', () => ({ syncPushRegistration: mocks.register }));
import { sendTestPush } from '../src/notifications/test-push';

beforeEach(() => { vi.resetAllMocks(); mocks.register.mockResolvedValue(true); });
describe('push test setup', () => {
  it('waits for successful registration before sending to the current account', async () => {
    let finish!: (value: boolean) => void;
    mocks.register.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
    const registered = vi.fn();
    const pending = sendTestPush('account-a', registered);
    expect(mocks.register).toHaveBeenCalledWith('account-a', true);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(registered).not.toHaveBeenCalled();
    finish(true);
    expect(await pending).toBe(true);
    expect(registered).toHaveBeenCalledOnce();
    expect(registered.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.mock.invocationCallOrder[0]!);
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith('/v1/push/test', { method: 'POST', token: 'account-a' });
  });

  it('does not send when permission was denied', async () => {
    mocks.register.mockResolvedValue(false);
    expect(await sendTestPush('account-a')).toBe(false);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('reports the registration failure and lets the user retry', async () => {
    mocks.register.mockRejectedValueOnce(new Error('Сеть недоступна'));
    await expect(sendTestPush('account-a')).rejects.toThrow('Сеть недоступна');
    expect(mocks.api).not.toHaveBeenCalled();
    expect(await sendTestPush('account-a')).toBe(true);
    expect(mocks.api).toHaveBeenCalledOnce();
  });

  it('sends only one test for simultaneous taps, then allows another explicit test', async () => {
    await Promise.all(Array.from({ length: 12 }, () => sendTestPush('account-a')));
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledOnce();
    await sendTestPush('account-a');
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it('registers again for a different signed-in account', async () => {
    await sendTestPush('account-a');
    await sendTestPush('account-b');
    expect(mocks.register.mock.calls).toEqual([['account-a', true], ['account-b', true]]);
    expect(mocks.api).toHaveBeenLastCalledWith('/v1/push/test', { method: 'POST', token: 'account-b' });
  });

  it('does not report delivery success when the server rejects the test', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Сервис push недоступен'));
    const registered = vi.fn();
    await expect(sendTestPush('account-a', registered)).rejects.toThrow('Сервис push недоступен');
    expect(registered).toHaveBeenCalledOnce();
    expect(await sendTestPush('account-a')).toBe(true);
  });
});
