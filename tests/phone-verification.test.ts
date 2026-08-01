import { describe, expect, it } from 'vitest';

import {
  deviceFingerprint,
  hashesMatch,
  maskPhone,
  normalizeRussianPhone,
  phoneCodeHash,
} from '../server/phone-verification';
import {
  buildAuthIdentity,
  clientSubnet,
  normalizeClientIp,
} from '../server/auth-abuse';

describe('passenger phone verification', () => {
  it('normalizes supported Russian mobile formats', () => {
    expect(normalizeRussianPhone('+7 (912) 345-67-89')).toBe('+79123456789');
    expect(normalizeRussianPhone('8 912 345 67 89')).toBe('+79123456789');
    expect(normalizeRussianPhone('9123456789')).toBe('+79123456789');
    expect(normalizeRussianPhone('+7 3412 00-00-00')).toBeNull();
    expect(normalizeRussianPhone('123')).toBeNull();
  });

  it('masks a phone before returning it from the SMS endpoint', () => {
    expect(maskPhone('+79123456789')).toBe('+7 912 ***-**-89');
  });

  it('binds a verification code to the user and phone', () => {
    const secret = 'test-secret';
    const expected = phoneCodeHash('passenger-1', '+79123456789', '123456', secret);

    expect(hashesMatch(expected, expected)).toBe(true);
    expect(
      hashesMatch(
        expected,
        phoneCodeHash('passenger-2', '+79123456789', '123456', secret),
      ),
    ).toBe(false);
    expect(
      hashesMatch(
        expected,
        phoneCodeHash('passenger-1', '+79123456789', '654321', secret),
      ),
    ).toBe(false);
  });

  it('creates stable, secret-scoped device fingerprints', () => {
    const first = deviceFingerprint('installation-1', 'secret-a');
    expect(first).toHaveLength(64);
    expect(deviceFingerprint('installation-1', 'secret-a')).toBe(first);
    expect(deviceFingerprint('installation-2', 'secret-a')).not.toBe(first);
    expect(deviceFingerprint('installation-1', 'secret-b')).not.toBe(first);
  });

  it('normalizes proxy addresses and groups them into abuse-control subnets', () => {
    expect(normalizeClientIp('::ffff:192.168.10.25')).toBe('192.168.10.25');
    expect(clientSubnet('192.168.10.25')).toBe('192.168.10.0/24');
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8:0:0:0:0:0:1');
    expect(clientSubnet('2001:db8:0:0:0:0:0:1')).toBe('2001:db8:0:0::/64');
    expect(normalizeClientIp('spoofed-value')).toBe('unknown');
  });

  it('builds stable fingerprints without retaining a raw installation id', () => {
    const first = buildAuthIdentity('203.0.113.42', '+7 (912) 345-67-89', 'installation-123456');
    const second = buildAuthIdentity('203.0.113.42', '+79123456789', 'installation-123456');

    expect(first.phoneFingerprint).toBe(second.phoneFingerprint);
    expect(first.installationFingerprint).toBe(second.installationFingerprint);
    expect(first.installationFingerprint).toHaveLength(64);
    expect(first.phoneMask).toBe('+7 912 ***-**-89');
    expect(first.subnet).toBe('203.0.113.0/24');
  });
});
