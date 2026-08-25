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
  vkCommunityMessageUrl,
} from '../server/vk-auth';

describe('VK ID authorization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds an OAuth 2.1 PKCE URL requesting only the phone scope', () => {
    const url = new URL(vkAuthorizationUrl({
      state: 'state-token',
      codeChallenge: 'pkce-challenge',
    }));
    expect(url.origin + url.pathname).toBe('https://id.vk.ru/authorize');
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      response_type: 'code',
      client_id: '123456',
      app_id: '123456',
      redirect_uri: 'https://api.taxigr.ru/v1/auth/vk/callback',
      state: 'state-token',
      code_challenge: 'pkce-challenge',
      code_challenge_method: 's256',
      scope: 'phone',
      prompt: '',
      sdk_type: 'vkid',
      v: '2.6.1',
    });
    expect(params.stats_info).toBeDefined();
    if (!params.stats_info) throw new Error('stats_info is missing');
    expect(JSON.parse(Buffer.from(params.stats_info, 'base64').toString('utf8'))).toEqual({
      flow_source: 'from_custom_auth',
      session_id: expect.stringMatching(/^[qazwsxedcrfvtgbyhnujmikol]{6}$/u),
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
          avatar: 'https://sun.example.userapi.com/avatar.jpg',
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
      avatarUrl: 'https://sun.example.userapi.com/avatar.jpg',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('finishes VK phone confirmation without blocking on community messages', () => {
    const html = vkCallbackHtml(true);
    expect(html).toContain('Вход подтверждён');
    expect(html).toContain('window.close()');
    expect(html).toContain('Возвращаем вас в «Такси Грахово»');
    expect(html).not.toContain('AllowMessagesFromCommunity');
    expect(html).not.toContain('Открыть чат сообщества');
  });

  it('builds a direct community message link instead of the conversations list', () => {
    expect(vkCommunityMessageUrl('193790756')).toBe('https://vk.me/club193790756');
  });
});
