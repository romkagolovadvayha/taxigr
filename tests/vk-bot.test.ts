import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/config', () => ({
  config: {
    VK_BOT_TOKEN: 'community-token',
    VK_COMMUNITY_ID: '193790756',
    VK_API_VERSION: '5.199',
  },
}));

import { isVkMessagesAllowed, sendVkMessage, vkInlineKeyboard } from '../server/vk-bot';

describe('VK community bot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends messages through the community API without placing the token in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await sendVkMessage('42', { message: 'Заказ принят' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.vk.com/method/messages.send');
    expect(url).not.toContain('community-token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('access_token')).toBe('community-token');
    expect(body.get('peer_id')).toBe('42');
    expect(body.get('message')).toBe('Заказ принят');
  });

  it('maps action buttons to VK callback and link buttons', () => {
    expect(vkInlineKeyboard([[
      { type: 'callback', label: 'Принять', data: 'r:a:id', intent: 'positive' },
      { type: 'link', label: 'Открыть', url: 'https://taxigr.ru/' },
    ]])).toEqual({
      inline: true,
      buttons: [[
        {
          action: { type: 'callback', label: 'Принять', payload: '{"data":"r:a:id"}' },
          color: 'positive',
        },
        {
          action: { type: 'open_link', label: 'Открыть', link: 'https://taxigr.ru/' },
        },
      ]],
    });
  });

  it('checks that the community may write to the authenticated user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: { is_allowed: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(isVkMessagesAllowed('42')).resolves.toBe(true);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = new URLSearchParams(String(request.body));
    expect(body.get('group_id')).toBe('193790756');
    expect(body.get('user_id')).toBe('42');
  });
});
