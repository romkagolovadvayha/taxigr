import * as Linking from 'expo-linking';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openPhoneCall, phoneCallUrl } from '../src/utils/open-phone-call';

vi.mock('expo-linking', () => ({
  canOpenURL: vi.fn(),
  openURL: vi.fn(),
}));

describe('phone calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Linking.canOpenURL).mockResolvedValue(true);
    vi.mocked(Linking.openURL).mockResolvedValue(true);
  });

  it('builds a dialable URL from a formatted phone number', () => {
    expect(phoneCallUrl('+7 (912) 345-67-89')).toBe('tel:+79123456789');
    expect(phoneCallUrl('8 912 345-67-89')).toBe('tel:89123456789');
    expect(phoneCallUrl('не указан')).toBeNull();
  });

  it('checks and opens the phone URL', async () => {
    await openPhoneCall('+7 (912) 345-67-89');

    expect(Linking.canOpenURL).toHaveBeenCalledWith('tel:+79123456789');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+79123456789');
  });

  it('does not try to open an unsupported phone URL', async () => {
    vi.mocked(Linking.canOpenURL).mockResolvedValue(false);

    await expect(openPhoneCall('+7 912 345-67-89')).rejects.toThrow(
      'Phone calls are unavailable',
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
