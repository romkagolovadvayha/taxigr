import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ availability: vi.fn(), getToken: vi.fn(), disableErrors: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { nativePushProvider: 'rustore' } } } }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' }, NativeEventEmitter: vi.fn(),
  NativeModules: { RustorePush: { checkPushAvailability: mocks.availability, getToken: mocks.getToken, offNativeErrorHandling: mocks.disableErrors } },
}));
import { getRuStorePushToken } from '../src/notifications/rustore-push.native';
beforeEach(() => { vi.resetAllMocks(); mocks.availability.mockResolvedValue(true); mocks.getToken.mockResolvedValue('fixture-token'); });

describe('RuStore registration errors', () => {
  it('returns the native token when the service is available', async () => {
    expect(await getRuStorePushToken()).toBe('fixture-token');
    expect(mocks.disableErrors).toHaveBeenCalledOnce();
  });
  it('explains an unavailable distributor instead of silently failing registration', async () => {
    mocks.availability.mockResolvedValue('HostAppNotInstalledException');
    await expect(getRuStorePushToken()).rejects.toThrow('RuStore установлен и обновлён');
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
  it('rejects an empty native token', async () => {
    mocks.getToken.mockResolvedValue('');
    await expect(getRuStorePushToken()).rejects.toThrow('RuStore не вернул push-токен');
  });
});
