import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLocationConsent } from '../src/location/location-disclosure';
import { readLocationConsent, writeLocationConsent } from '../src/location/location-consent-storage';

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, Platform: { OS: 'android' } }));
vi.mock('../src/location/location-consent-storage', () => ({ readLocationConsent: vi.fn(), writeLocationConsent: vi.fn() }));

describe('location disclosure consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLocationConsent).mockResolvedValue(false);
    vi.mocked(writeLocationConsent).mockResolvedValue(undefined);
  });

  it('records consent only after the explicit Allow button', async () => {
    const request = ensureLocationConsent('background');
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledOnce());
    const [, message, buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(message).toContain('даже когда приложение закрыто или не используется');
    expect(writeLocationConsent).not.toHaveBeenCalled();
    buttons?.find(button => button.text === 'Разрешить')?.onPress?.();
    await expect(request).resolves.toBe(true);
    expect(writeLocationConsent).toHaveBeenCalledWith('background');
  });

  it.each(['reject', 'dismiss'])('does not persist consent on %s', async (action) => {
    const request = ensureLocationConsent('pickup');
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledOnce());
    const [, , buttons, options] = vi.mocked(Alert.alert).mock.calls[0]!;
    if (action === 'reject') buttons?.find(button => button.style === 'cancel')?.onPress?.();
    else options?.onDismiss?.();
    await expect(request).resolves.toBe(false);
    expect(writeLocationConsent).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent requests and scopes remembered consent to its purpose', async () => {
    vi.mocked(readLocationConsent).mockImplementation(async purpose => purpose === 'pickup');
    await expect(ensureLocationConsent('pickup')).resolves.toBe(true);
    const first = ensureLocationConsent('driver');
    const second = ensureLocationConsent('driver');
    expect(first).toBe(second);
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledOnce());
    vi.mocked(Alert.alert).mock.calls[0]![3]?.onDismiss?.();
    await expect(first).resolves.toBe(false);
  });
});
