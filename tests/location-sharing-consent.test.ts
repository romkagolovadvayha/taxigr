import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_SHARING_STORAGE_KEY, readStoredLocationSharing } from '../src/preferences/location-sharing-storage.native';

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));

describe('passenger sharing consent migration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not inherit the previous default-on preference', async () => {
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => key === 'taxi_grahovo_share_passenger_location' ? 'true' : null);
    await expect(readStoredLocationSharing()).resolves.toBe(false);
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(LOCATION_SHARING_STORAGE_KEY);
  });
  it('restores sharing only from the new explicit-consent key', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('true');
    await expect(readStoredLocationSharing()).resolves.toBe(true);
  });
  it('fails closed when secure storage is unavailable', async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Unavailable'));
    await expect(readStoredLocationSharing()).resolves.toBe(false);
  });
});
