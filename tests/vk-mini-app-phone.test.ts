import { describe, expect, it } from 'vitest';

import { extractSignedVkPhone } from '../src/vk-mini-app/phone';

describe('VK Mini App phone response', () => {
  it('accepts a signed phone without relying on is_verified', () => {
    expect(extractSignedVkPhone({
      phone_number: ' 79998887766 ',
      sign: ' signed-phone ',
    })).toEqual({
      phoneNumber: '79998887766',
      sign: 'signed-phone',
    });

    expect(extractSignedVkPhone({
      phone_number: '79998887766',
      sign: 'signed-phone',
      is_verified: false,
    } as { phone_number: string; sign: string })).toEqual({
      phoneNumber: '79998887766',
      sign: 'signed-phone',
    });
  });

  it('rejects responses without the signed phone fields', () => {
    expect(extractSignedVkPhone({ phone_number: '79998887766' })).toBeNull();
    expect(extractSignedVkPhone({ sign: 'signed-phone' })).toBeNull();
  });
});
