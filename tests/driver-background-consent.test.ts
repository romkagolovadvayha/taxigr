import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncDriverBackgroundLocation } from '../src/location/driver-background-location';
import { ensureLocationConsent } from '../src/location/location-disclosure';
import { readLocationConsent } from '../src/location/location-consent-storage';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../src/location/location-disclosure', () => ({ ensureLocationConsent: vi.fn() }));
vi.mock('../src/location/location-consent-storage', () => ({ readLocationConsent: vi.fn() }));
vi.mock('@/api/client', () => ({ apiRequest: vi.fn(), ApiError: class extends Error {} }));
vi.mock('@/storage/auth-storage', () => ({ readSessionToken: vi.fn() }));
vi.mock('expo-task-manager', () => ({ defineTask: vi.fn(), isAvailableAsync: vi.fn() }));
vi.mock('expo-location', () => ({
  hasStartedLocationUpdatesAsync: vi.fn(), stopLocationUpdatesAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(), getForegroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(), requestBackgroundPermissionsAsync: vi.fn(),
  Accuracy: { Balanced: 3 }, ActivityType: { AutomotiveNavigation: 1 },
}));

describe('driver background consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(TaskManager.isAvailableAsync).mockResolvedValue(true);
    vi.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(false);
    vi.mocked(readLocationConsent).mockResolvedValue(false);
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
    vi.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  });
  it('does not reuse OS background permission without affirmative disclosure consent', async () => {
    vi.mocked(ensureLocationConsent).mockResolvedValue(false);
    await expect(syncDriverBackgroundLocation(true)).resolves.toBe(false);
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('stops an old task when automatic resume has no current consent', async () => {
    vi.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(true);
    await expect(syncDriverBackgroundLocation(true, false)).resolves.toBe(false);
    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledOnce();
    expect(ensureLocationConsent).not.toHaveBeenCalled();
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
  it('starts only after consent when OS permissions are already granted', async () => {
    vi.mocked(ensureLocationConsent).mockResolvedValue(true);
    await expect(syncDriverBackgroundLocation(true)).resolves.toBe(true);
    expect(ensureLocationConsent).toHaveBeenCalledWith('background');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledOnce();
  });
});
