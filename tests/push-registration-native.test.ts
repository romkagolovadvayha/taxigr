import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(), requestPermissions: vi.fn(), getChannels: vi.fn(),
  setChannel: vi.fn(), getToken: vi.fn(), api: vi.fn(),
  isRuStore: vi.fn(), getRuStoreToken: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({ default: { appOwnership: 'standalone', easConfig: { projectId: 'test-project' } } }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, MAX: 5, DEFAULT: 3 },
  getPermissionsAsync: mocks.getPermissions,
  requestPermissionsAsync: mocks.requestPermissions,
  getNotificationChannelsAsync: mocks.getChannels,
  setNotificationChannelAsync: mocks.setChannel,
  getExpoPushTokenAsync: mocks.getToken,
}));
vi.mock('@/api/client', () => ({ apiRequest: mocks.api }));
vi.mock('@/notifications/rustore-push', () => ({ isRuStorePushEnabled: mocks.isRuStore, getRuStorePushToken: mocks.getRuStoreToken }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.getPermissions.mockResolvedValue({ status: 'granted' });
  mocks.requestPermissions.mockResolvedValue({ status: 'granted' });
  mocks.getChannels.mockResolvedValue([]);
  mocks.setChannel.mockImplementation(async (id, channel) => ({ id, ...channel }));
  mocks.getToken.mockResolvedValue({ data: 'test-push-token' });
  mocks.isRuStore.mockReturnValue(false);
});
afterEach(() => vi.useRealTimers());

describe('push registration startup work', () => {
  it('does no channel/token work and opens no permission dialog on an ungranted first launch', async () => {
    mocks.getPermissions.mockResolvedValue({ status: 'undetermined' });
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    expect(await syncPushRegistration('test-session')).toBe(false);
    expect(mocks.getChannels).not.toHaveBeenCalled();
    expect(mocks.setChannel).not.toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it('shares channel setup across simultaneous foreground and token refresh events', async () => {
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await Promise.all([syncPushRegistration('test-session'), syncPushRegistration('test-session')]);
    expect(mocks.getChannels).toHaveBeenCalledOnce();
    const ids = mocks.setChannel.mock.calls.map(([id]) => id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids).toContain('driver-order-updated-voice-v1');
    expect(mocks.getToken).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledOnce();
  });

  it('preserves existing channel settings and inherits a muted legacy channel', async () => {
    mocks.getChannels.mockResolvedValue([
      { id: 'ride-taxi-found-v2', importance: 0, sound: null, enableVibrate: false },
      { id: 'ride-chat-v1', importance: 0, sound: null, enableVibrate: false },
    ]);
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await syncPushRegistration('test-session');
    expect(mocks.setChannel.mock.calls.some(([id]) => id === 'ride-taxi-found-v2')).toBe(false);
    expect(mocks.setChannel).toHaveBeenCalledWith('ride-chat-voice-v1', expect.objectContaining({
      importance: 0, sound: null, enableVibrate: false,
    }));
  });

  it('creates Android channels before an explicitly requested permission dialog', async () => {
    mocks.getPermissions.mockResolvedValue({ status: 'undetermined' });
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    expect(await syncPushRegistration('test-session', true)).toBe(true);
    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.setChannel.mock.invocationCallOrder.at(-1)!)
      .toBeLessThan(mocks.requestPermissions.mock.invocationCallOrder[0]!);
  });

  it('retries channel setup after a temporary platform error', async () => {
    mocks.getChannels.mockRejectedValueOnce(new Error('temporarily unavailable'));
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await expect(syncPushRegistration('test-session')).rejects.toThrow('temporarily unavailable');
    expect(await syncPushRegistration('test-session')).toBe(true);
    expect(mocks.getChannels).toHaveBeenCalledTimes(2);
  });

  it('does not register a device if permission is denied', async () => {
    mocks.getPermissions.mockResolvedValue({ status: 'denied' });
    mocks.requestPermissions.mockResolvedValue({ status: 'denied' });
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    expect(await syncPushRegistration('test-session', true)).toBe(false);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('does not lose an explicit Enable tap during a background permission check', async () => {
    let finish!: (permission: { status: string }) => void;
    mocks.getPermissions.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    mocks.getPermissions.mockResolvedValue({ status: 'undetermined' });
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    const background = syncPushRegistration('test-session');
    const explicit = syncPushRegistration('test-session', true);
    finish({ status: 'undetermined' });
    expect(await background).toBe(false);
    expect(await explicit).toBe(true);
    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledOnce();
  });

  it('does not treat a failed server registration as success and retries on the next call', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline'));
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await expect(syncPushRegistration('test-session')).rejects.toThrow('offline');
    expect(await syncPushRegistration('test-session', true)).toBe(true);
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it('rebinds the device token when a different account signs in', async () => {
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await syncPushRegistration('first-session');
    await syncPushRegistration('second-session');
    expect(mocks.api.mock.calls.map(([, options]) => options.token)).toEqual(['first-session', 'second-session']);
  });

  it('registers the RuStore token with its provider without contacting Expo', async () => {
    mocks.isRuStore.mockReturnValue(true);
    mocks.getRuStoreToken.mockResolvedValue('fixture-rustore-token');
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    expect(await syncPushRegistration('test-session')).toBe(true);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.api.mock.calls[0]![1].body)).toEqual({ token: 'fixture-rustore-token', platform: 'android', provider: 'rustore' });
  });

  it('reports an unavailable RuStore service as a registration error, not denied permission', async () => {
    mocks.isRuStore.mockReturnValue(true);
    mocks.getRuStoreToken.mockResolvedValue(null);
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await expect(syncPushRegistration('test-session')).rejects.toThrow('RuStore');
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('rejects an empty token before sending a registration request', async () => {
    mocks.getToken.mockResolvedValue({ data: '' });
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    await expect(syncPushRegistration('test-session')).rejects.toThrow('пустой push-токен');
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('unblocks a hanging token request, ignores its late result and allows a retry', async () => {
    vi.useFakeTimers();
    let finish!: (token: { data: string }) => void;
    mocks.getToken.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { syncPushRegistration } = await import('../src/notifications/push-registration.native');
    const failed = expect(syncPushRegistration('test-session')).rejects.toThrow('Проверьте интернет');
    await vi.advanceTimersByTimeAsync(20_001);
    await failed;
    finish({ data: 'late-token' });
    await Promise.resolve();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(await syncPushRegistration('test-session')).toBe(true);
    expect(mocks.api).toHaveBeenCalledOnce();
  });
});
