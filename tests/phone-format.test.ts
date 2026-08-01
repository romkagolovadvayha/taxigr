import { describe, expect, it } from 'vitest';

import {
  formatRussianNationalPhone,
  formatRussianPhone,
  isCompleteRussianMobilePhone,
  russianNationalPhoneDigits,
  russianPhoneE164,
} from '../src/utils/phone';

describe('Russian phone field formatting', () => {
  it('keeps the country code outside the editable digits', () => {
    expect(russianNationalPhoneDigits('+7 (912) 345-67-89')).toBe('9123456789');
    expect(russianNationalPhoneDigits('8 912 345 67 89')).toBe('9123456789');
    expect(russianNationalPhoneDigits('9123456789')).toBe('9123456789');
  });

  it('formats partial input without adding fake digits', () => {
    expect(formatRussianNationalPhone('')).toBe('');
    expect(formatRussianNationalPhone('9')).toBe('(9');
    expect(formatRussianNationalPhone('912')).toBe('(912)');
    expect(formatRussianNationalPhone('9123')).toBe('(912) 3');
    expect(formatRussianNationalPhone('9123456789')).toBe('(912) 345-67-89');
  });

  it('accepts only a complete Russian mobile number', () => {
    expect(isCompleteRussianMobilePhone('9123456789')).toBe(true);
    expect(isCompleteRussianMobilePhone('8123456789')).toBe(false);
    expect(isCompleteRussianMobilePhone('912345678')).toBe(false);
    expect(russianPhoneE164('9123456789')).toBe('+79123456789');
    expect(russianPhoneE164('8123456789')).toBeNull();
    expect(formatRussianPhone('+79123456789')).toBe('+7 (912) 345-67-89');
  });

  it('limits pasted input to ten national digits', () => {
    expect(russianNationalPhoneDigits('+7 (912) 345-67-89 добавочный 123')).toBe(
      '9123456789',
    );
  });
});
