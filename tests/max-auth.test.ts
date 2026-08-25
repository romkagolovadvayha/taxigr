import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractPhoneFromMaxVcf,
  getMaxDialogProfilePhotoUrl,
  maxContactHash,
  normalizeMaxVcfInfo,
  verifyMaxContact,
} from '../server/max-bot';

describe('MAX phone confirmation', () => {
  afterEach(() => vi.unstubAllGlobals());
  const token = 'max-bot-token';
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'TEL;TYPE=cell:79123456789',
    'FN:Иван Иванов',
    'END:VCARD',
    '',
  ].join('\r\n');

  it('normalizes escaped CRLF before hashing', () => {
    const escaped = vcf.replace(/\r\n/gu, '\\r\\n');
    expect(normalizeMaxVcfInfo(escaped)).toBe(vcf);
    expect(maxContactHash(escaped, token)).toBe(
      createHmac('sha256', token).update(vcf).digest('hex'),
    );
  });

  it('accepts only a signed contact payload', () => {
    const hash = maxContactHash(vcf, token);
    expect(verifyMaxContact({ vcf_info: vcf, hash }, token)).toBe(true);
    expect(verifyMaxContact({ vcf_info: vcf, hash: `${hash.slice(0, -1)}0` }, token)).toBe(false);
    expect(verifyMaxContact({ vcf_info: vcf }, token)).toBe(false);
  });

  it('extracts and normalizes the Russian mobile number from vCard', () => {
    expect(extractPhoneFromMaxVcf(vcf)).toBe('+79123456789');
    expect(extractPhoneFromMaxVcf(vcf.replace('79123456789', '+7 (912) 345-67-89')))
      .toBe('+79123456789');
  });

  it('reads the user avatar from a private dialog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'dialog',
      dialog_with_user: {
        user_id: 42,
        avatar_url: 'https://cdn.max.ru/small.jpg',
        full_avatar_url: 'https://cdn.max.ru/full.jpg',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(getMaxDialogProfilePhotoUrl('100', '42'))
      .resolves.toBe('https://cdn.max.ru/full.jpg');
  });
});
