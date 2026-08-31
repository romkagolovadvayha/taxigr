import * as Location from 'expo-location';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureForegroundLocationPermission } from '../src/location/foreground-location-permission';

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
});
