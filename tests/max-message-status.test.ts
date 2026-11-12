import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/config', () => ({ config: { MAX_BOT_TOKEN: 'test-token' } }));
import { editMaxMessage, sendMaxMessage } from '../server/max-bot';

describe('MAX order message identifiers', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('retains the documented message.body.mid and can remove its inline buttons', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { body: { mid: 'mid.sent-order' } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetch);
    const id = await sendMaxMessage('42', { text: 'Новый заказ' });
    expect(id).toBe('mid.sent-order');
    await editMaxMessage('42', id!, { text: 'Заказ уже взят', attachments: [] });
    expect(fetch.mock.calls[1]![0]).toBe('https://platform-api2.max.ru/messages?message_id=mid.sent-order');
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ text: 'Заказ уже взят', attachments: [] });
  });
  it('also accepts the earlier unwrapped message response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ body: { mid: 'mid.legacy' } }))));
    expect(await sendMaxMessage('42', { text: 'Новый заказ' })).toBe('mid.legacy');
  });
});
