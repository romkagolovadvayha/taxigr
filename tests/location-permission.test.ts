import * as Location from 'expo-location';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureForegroundLocationPermission } from '../src/location/foreground-location-permission';
import { ensureLocationConsent } from '../src/location/location-disclosure';

vi.mock('../src/location/location-disclosure', () => ({ ensureLocationConsent: vi.fn() }));

vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}));

const grantedPermission = {
  status: 'granted',
  granted: true,
  canAskAgain: true,
  expires: 'never',
} as Location.LocationPermissionResponse;

const deniedPermission = {
  status: 'denied',
  granted: false,
  canAskAgain: true,
  expires: 'never',
} as Location.LocationPermissionResponse;

describe('ensureForegroundLocationPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureLocationConsent).mockResolvedValue(true);
  });

  it('keeps an existing foreground location permission without another prompt', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(grantedPermission);

    await expect(ensureForegroundLocationPermission()).resolves.toBe(grantedPermission);

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('deduplicates permission prompts while the launch request is in progress', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(deniedPermission);
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(grantedPermission);

    const firstRequest = ensureForegroundLocationPermission();
    const secondRequest = ensureForegroundLocationPermission();

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      grantedPermission,
      grantedPermission,
    ]);
    expect(Location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('requests access when the browser cannot inspect permission state first', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockRejectedValue(
      new Error('Permissions API is unavailable'),
    );
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(grantedPermission);

    await expect(ensureForegroundLocationPermission()).resolves.toBe(grantedPermission);

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not request OS access or reuse an old grant after disclosure rejection', async () => {
    vi.mocked(ensureLocationConsent).mockResolvedValue(false);
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(grantedPermission);
    await expect(ensureForegroundLocationPermission('sharing')).resolves.toMatchObject({ granted: false });
    expect(ensureLocationConsent).toHaveBeenCalledWith('sharing');
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('waits for affirmative consent before requesting the system permission', async () => {
    let accept!: (value: boolean) => void;
    vi.mocked(ensureLocationConsent).mockReturnValue(new Promise(resolve => { accept = resolve; }));
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(deniedPermission);
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(grantedPermission);
    const request = ensureForegroundLocationPermission('driver');
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    accept(true);
    await expect(request).resolves.toBe(grantedPermission);
    expect(ensureLocationConsent).toHaveBeenCalledWith('driver');
  });
});
