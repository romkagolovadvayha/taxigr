import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(), requestPermissions: vi.fn(), getChannels: vi.fn(),
  setChannel: vi.fn(), getToken: vi.fn(), api: vi.fn(),
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
vi.mock('@/notifications/rustore-push', () => ({ isRuStorePushEnabled: () => false }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.getPermissions.mockResolvedValue({ status: 'granted' });
  mocks.requestPermissions.mockResolvedValue({ status: 'granted' });
  mocks.getChannels.mockResolvedValue([]);
  mocks.setChannel.mockImplementation(async (id, channel) => ({ id, ...channel }));
  mocks.getToken.mockResolvedValue({ data: 'test-push-token' });
});

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
});
