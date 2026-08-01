import { describe, expect, it } from 'vitest';

import {
  isPlayReviewPhone,
  PLAY_REVIEW_CODE,
  PLAY_REVIEW_PHONE,
} from '../server/play-review-auth';
import { normalizeRussianPhone } from '../server/phone-verification';

describe('Google Play review phone authentication', () => {
  it('recognizes only the permanent passenger review number', () => {
    expect(PLAY_REVIEW_PHONE).toBe('+79998887766');
    expect(PLAY_REVIEW_CODE).toBe('4455');
    expect(normalizeRussianPhone('9998887766')).toBe(PLAY_REVIEW_PHONE);
    expect(isPlayReviewPhone('+79998887766')).toBe(true);
    expect(isPlayReviewPhone('+79998887765')).toBe(false);
  });
});
