import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/config', () => ({
  config: {
    VK_APP_ID: '123456',
    VK_REDIRECT_URI: 'https://api.taxigr.ru/v1/auth/vk/callback',
  },
}));

import {
  exchangeVkAuthorizationCode,
  vkAuthorizationUrl,
  vkCallbackHtml,
} from '../server/vk-auth';

describe('VK ID authorization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds an OAuth 2.1 PKCE URL requesting only the phone scope', () => {
    const url = new URL(vkAuthorizationUrl({
      state: 'state-token',
      codeChallenge: 'pkce-challenge',
    }));
    expect(url.origin + url.pathname).toBe('https://id.vk.ru/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: '123456',
      redirect_uri: 'https://api.taxigr.ru/v1/auth/vk/callback',
      state: 'state-token',
      code_challenge: 'pkce-challenge',
      code_challenge_method: 's256',
      scope: 'phone',
    });
  });

  it('exchanges the code and normalizes the phone returned by VK ID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        user_id: 42,
        state: 'state-token',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: {
          user_id: 42,
          phone: '8 (912) 345-67-89',
          first_name: 'Иван',
          last_name: 'Иванов',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeVkAuthorizationCode({
      code: 'code',
      codeVerifier: 'verifier',
      deviceId: 'device',
      state: 'state-token',
    })).resolves.toEqual({
      userId: '42',
      phone: '+79123456789',
      firstName: 'Иван',
      lastName: 'Иванов',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders a safe completion page with the community link', () => {
    expect(vkCallbackHtml(true)).toContain('https://vk.ru/taxigr');
    expect(vkCallbackHtml(true)).toContain('Вход подтверждён');
    expect(vkCallbackHtml(false)).not.toContain('Написать сообществу');
  });
});
