import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({api:vi.fn(),register:vi.fn(),subscription:vi.fn(),subscribe:vi.fn(),permission:vi.fn()}));
vi.mock('@/api/client', () => ({apiRequest:mocks.api}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  const notification = {permission:'granted',requestPermission:mocks.permission};
  vi.stubGlobal('Notification', notification);
  vi.stubGlobal('window', {Notification:notification,PushManager:{},atob});
  vi.stubGlobal('navigator', {serviceWorker:{register:mocks.register,ready:Promise.resolve()}});
  mocks.api.mockImplementation(async (path: string) => path === '/v1/push/config'
    ? {supported:true,vapidPublicKey:'aGVsbG8'} : {registered:true});
  const subscription = {toJSON:() => ({endpoint:'https://push.example.test/device',keys:{p256dh:'key',auth:'secret'}})};
  mocks.subscription.mockResolvedValue(subscription);
  mocks.subscribe.mockResolvedValue(subscription);
  mocks.register.mockResolvedValue({pushManager:{getSubscription:mocks.subscription,subscribe:mocks.subscribe}});
  mocks.permission.mockResolvedValue('granted');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('web push registration', () => {
  it('shares concurrent foreground registrations and skips repeated successful background syncs', async () => {
    const {syncPushRegistration} = await import('../src/notifications/push-registration.web');
    expect(await Promise.all(Array.from({length:8}, () => syncPushRegistration('account-a')))).toEqual(Array(8).fill(true));
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(await syncPushRegistration('account-a')).toBe(true);
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it('refreshes after five minutes and honours an explicit test before that', async () => {
    vi.useFakeTimers();
    const {syncPushRegistration} = await import('../src/notifications/push-registration.web');
    await syncPushRegistration('account-a');
    await syncPushRegistration('account-a', true);
    expect(mocks.api).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await syncPushRegistration('account-a');
    expect(mocks.api).toHaveBeenCalledTimes(6);
  });

  it('registers the current account when the user changes accounts', async () => {
    const {syncPushRegistration} = await import('../src/notifications/push-registration.web');
    await syncPushRegistration('account-a');
    await syncPushRegistration('account-b');
    expect(mocks.api).toHaveBeenLastCalledWith('/v1/web-push-subscriptions', expect.objectContaining({token:'account-b',method:'PUT'}));
    expect(mocks.api).toHaveBeenCalledTimes(4);
  });

  it('does not cache an unsuccessful registration and allows a later retry', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Network failed'));
    const {syncPushRegistration} = await import('../src/notifications/push-registration.web');
    await expect(syncPushRegistration('account-a')).rejects.toThrow('Network failed');
    expect(await syncPushRegistration('account-a')).toBe(true);
    expect(mocks.api).toHaveBeenCalledTimes(3);
  });

  it('does no network work when permission was revoked after a successful registration', async () => {
    const {syncPushRegistration} = await import('../src/notifications/push-registration.web');
    await syncPushRegistration('account-a');
    Object.assign(Notification, {permission:'denied'});
    expect(await syncPushRegistration('account-a')).toBe(false);
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it('lets an explicit Enable tap follow a background check that had no permission', async () => {
    Object.assign(Notification, {permission:'default'});
    const {syncPushRegistration} = await import('../src/notifications/push-registration.web');
    const background = syncPushRegistration('account-a');
    const explicit = syncPushRegistration('account-a', true);
    expect(await background).toBe(false);
    expect(await explicit).toBe(true);
    expect(mocks.permission).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});
