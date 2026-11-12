import { afterEach, describe, expect, it, vi } from 'vitest';
import { VkBotTransport } from '../src/api/vk-bot-transport';

const options = { token: 'test-bot-token', groupId: '193790756', serviceUserId: '33610634' };
const response = (value: unknown) => new Response(JSON.stringify({ response: value }));
afterEach(() => { vi.useRealTimers(); });
describe('VK relay recipient isolation', () => {
  it('sends only to the fixed service peer and never puts the token in the URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(123));
    const api = new VkBotTransport({ ...options, fetcher });
    expect(await api.send('TGR2|test-packet')).toBe('123');
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.vk.ru/method/messages.send');
    expect(new URLSearchParams(request.body).get('peer_id')).toBe(options.serviceUserId);
    expect(request.headers.Authorization).toBe('Bearer test-bot-token');
    expect(String(request.body)).not.toContain('test-bot-token');
  });
  it('filters another peer and incoming messages from a response lookup', async () => {
    const own = { id: 123, peer_id: 33610634, from_id: -193790756, out: 1, date: 100, text: 'own' };
    const fetcher = vi.fn().mockResolvedValue(response({ items: [own, { ...own, peer_id: 999 }, { ...own, from_id: 33610634, out: 0 }] }));
    const api = new VkBotTransport({ ...options, fetcher });
    expect(await api.read(['123'])).toEqual([{ timestamp: 100_000, recipient: { chat_id: '33610634' }, body: { mid: '123', text: 'own' } }]);
  });
  it('requires messages permission from the configured service account', async () => {
    const api = new VkBotTransport({ ...options, fetcher: vi.fn().mockResolvedValue(response({ is_allowed: 0 })) });
    await expect(api.verifyRecipient()).rejects.toThrow('VK_RELAY_RECIPIENT_NOT_ALLOWED');
  });
  it('keeps random_id stable when VK asks to retry the same send', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":{"error_code":6}}')).mockResolvedValueOnce(response(456));
    const api = new VkBotTransport({ ...options, fetcher });
    const send = api.send('TGR2|retry-packet'); await vi.advanceTimersByTimeAsync(1100);
    expect(await send).toBe('456');
    expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
  });
  it('pauses all VK operations after dialog flood control instead of hammering it', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":{"error_code":9}}'));
    const api = new VkBotTransport({ ...options, fetcher });
    const first = expect(api.send('TGR2|flood-test')).rejects.toMatchObject({ retryAfterMs: 300_000 });
    await vi.advanceTimersByTimeAsync(1); await first;
    await expect(api.send('TGR2|next-packet')).rejects.toMatchObject({ message: 'VK_RELAY_FLOOD_CONTROL' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
