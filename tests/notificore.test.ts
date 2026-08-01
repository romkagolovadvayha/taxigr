import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Notificore 2FA provider', () => {
  it('creates a four-digit OTP with template 271 and the server-side bearer token', async () => {
    vi.stubEnv('SMS_PROVIDER', 'notificore');
    vi.stubEnv('NOTIFICORE_API_KEY', 'test_notificore_key');
    vi.stubEnv('NOTIFICORE_BEARER_TOKEN', 'test_bearer_token');
    vi.stubEnv('NOTIFICORE_TEMPLATE_ID', '271');
    vi.stubEnv('NOTIFICORE_ORIGINATOR', 'TaxiGr');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'authentication-1', status: 'pending' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { sendPhoneVerificationCode } = await import('../server/sms');

    const session = await sendPhoneVerificationCode('+79123456789', '1234', '203.0.113.1');

    expect(session).toEqual({
      providerAuthenticationId: 'authentication-1',
      expiresInSeconds: 180,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://one-api.notificore.ru/api/2fa/authentications/otp',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test_bearer_token' }),
        body: JSON.stringify({
          channel: 'sms',
          recipient: '79123456789',
          sender: 'TaxiGr',
          template_id: 271,
          code_digits: 4,
          code_max_tries: 3,
          code_lifetime: 180,
        }),
      }),
    );
  });

  it('obtains a bearer token from the API key and verifies the OTP at Notificore', async () => {
    vi.stubEnv('SMS_PROVIDER', 'notificore');
    vi.stubEnv('NOTIFICORE_API_KEY', 'live_test_key');
    vi.stubEnv('NOTIFICORE_BEARER_TOKEN', '');
    vi.stubEnv('NOTIFICORE_ORIGINATOR', 'TaxiGr');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ bearer: 'received_bearer' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'authentication-1', status: 'verified' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { verifyPhoneVerificationCode } = await import('../server/sms');

    await expect(verifyPhoneVerificationCode('authentication-1', '1234'))
      .resolves.toBe('verified');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://one-api.notificore.ru/api/auth/login',
      expect.objectContaining({ body: JSON.stringify({ api_key: 'live_test_key' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://one-api.notificore.ru/api/2fa/authentications/otp/authentication-1/verify',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer received_bearer' }),
        body: JSON.stringify({ access_code: 1234 }),
      }),
    );
  });

  it('maps an incorrect provider code to an invalid result', async () => {
    vi.stubEnv('SMS_PROVIDER', 'notificore');
    vi.stubEnv('NOTIFICORE_BEARER_TOKEN', 'test_bearer_token');
    vi.stubEnv('NOTIFICORE_ORIGINATOR', 'TaxiGr');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ errors: [{ message: 'The code does not match the expected value' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { verifyPhoneVerificationCode } = await import('../server/sms');

    await expect(verifyPhoneVerificationCode('authentication-1', '0000'))
      .resolves.toBe('invalid');
  });
});
