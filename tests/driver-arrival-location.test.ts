import * as Location from 'expo-location';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDriverArrivalLocation } from '../src/location/driver-arrival-location';
import { ensureForegroundLocationPermission } from '../src/location/foreground-location-permission';

vi.mock('../src/location/foreground-location-permission', () => ({ ensureForegroundLocationPermission: vi.fn() }));
vi.mock('expo-location', () => ({ watchPositionAsync: vi.fn(), getLastKnownPositionAsync: vi.fn(), Accuracy: { High: 4 } }));

function position(age = 0, accuracy = 8): Location.LocationObject {
  return { timestamp: Date.now() - age, coords: {
    latitude: 56.0477, longitude: 51.9586, accuracy, altitude: null,
    altitudeAccuracy: null, heading: null, speed: null,
  } };
}

describe('arrival button GPS', () => {
  let onPosition: Location.LocationCallback;
  const remove = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.mocked(ensureForegroundLocationPermission).mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(null);
    vi.mocked(Location.watchPositionAsync).mockImplementation(async (_options, callback) => {
      onPosition = callback;
      return { remove };
    });
  });
  afterEach(() => vi.useRealTimers());

  it('gets a new stationary fix and cleans up the watcher', async () => {
    const pending = getDriverArrivalLocation();
    await vi.advanceTimersByTimeAsync(0);
    const fix = position();
    onPosition(fix);
    await expect(pending).resolves.toEqual({ latitude: 56.0477, longitude: 51.9586, accuracyMeters: 8, recordedAt: fix.timestamp });
    expect(remove).toHaveBeenCalledOnce();
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
  it('ignores stale and inaccurate callbacks until a fresh fix arrives', async () => {
    const pending = getDriverArrivalLocation();
    await vi.advanceTimersByTimeAsync(0);
    onPosition(position(180_000));
    onPosition(position(0, 3_000));
    expect(remove).not.toHaveBeenCalled();
    onPosition(position());
    await expect(pending).resolves.toMatchObject({ accuracyMeters: 8 });
  });
  it('times out, stops watching and never relabels an old cached fix as fresh', async () => {
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(position(180_000));
    const pending = getDriverArrivalLocation();
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
  });
  it('uses a genuinely recent fix if GPS temporarily fails', async () => {
    vi.mocked(Location.watchPositionAsync).mockRejectedValue(new Error('GPS unavailable'));
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(position(5_000));
    await expect(getDriverArrivalLocation()).resolves.toMatchObject({ latitude: 56.0477 });
  });
  it('removes subscriptions that finish starting after the timeout', async () => {
    let started!: (value: Location.LocationSubscription) => void;
    vi.mocked(Location.watchPositionAsync).mockImplementation(() => new Promise(resolve => { started = resolve; }));
    const pending = getDriverArrivalLocation();
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toBeUndefined();
    started({ remove });
    await vi.advanceTimersByTimeAsync(0);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('explains denied permission without starting location collection', async () => {
    vi.mocked(ensureForegroundLocationPermission).mockResolvedValue({ granted: false } as Location.LocationPermissionResponse);
    await expect(getDriverArrivalLocation()).rejects.toThrow('Разрешите геолокацию');
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
});
