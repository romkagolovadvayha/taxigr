import { beforeEach, describe, expect, it, vi } from 'vitest';

const proxy = vi.hoisted(() => ({
  fetch: vi.fn(), dispatcher: vi.fn(), settings: vi.fn(),
  config: { BOT_AI_API_KEY: 'test-key', BOT_AI_BASE_URL: 'https://api.openai.com/v1', BOT_AI_MODEL: 'gpt-4o-mini', isProduction: true },
}));
vi.mock('undici', () => ({ fetch: proxy.fetch }));
vi.mock('../server/config', () => ({ config: proxy.config }));
vi.mock('../server/gateway-proxy', () => ({ gatewayDispatcher: proxy.dispatcher }));
vi.mock('../server/gateway-settings', () => ({ readGatewaySettings: proxy.settings }));

import { interpretBotAddress } from '../server/bot-address-ai';

const agent = { name: 'test gateway' };
const response = (pickup: unknown, destination: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ pickup, destination }) } }],
}));

beforeEach(() => {
  vi.resetAllMocks();
  proxy.config.BOT_AI_API_KEY = 'test-key';
  proxy.settings.mockResolvedValue({ proxyEnabled: true });
  proxy.dispatcher.mockReturnValue(agent);
});

describe('taxi address interpretation through the configured gateway', () => {
  it('uses the proxy and keeps private access details out of the request', async () => {
    proxy.fetch.mockResolvedValue(response('Советская 10', 'г. Можга'));
    const result = await interpretBotAddress('С Советской 10 кв. 27 в Можгу, +7 (999) 111-22-33', 'pickup');
    expect(result).toEqual({ pickup: 'Советская 10', destination: 'г. Можга' });
    const [url, options] = proxy.fetch.mock.calls[0]!;
    expect(url.href).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.dispatcher).toBe(agent);
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body).messages[1].content).not.toMatch(/27|111-22-33/);
  });

  it.each(['Советская 11', 'Советская 10б', 'Советская 10/1'])('discards an invented number in %s', async pickup => {
    proxy.fetch.mockResolvedValue(response(pickup, null));
    expect(await interpretBotAddress('Советская 10а', 'pickup')).toEqual({ pickup: null, destination: null });
  });

  it('does not use OpenAI without a proxy', async () => {
    proxy.dispatcher.mockReturnValue(undefined);
    await expect(interpretBotAddress('Советская 10', 'pickup')).resolves.toBeNull();
    expect(proxy.fetch).not.toHaveBeenCalled();
  });

  it('skips the gateway entirely when the integration is unconfigured', async () => {
    proxy.config.BOT_AI_API_KEY = '';
    await expect(interpretBotAddress('Советская 10', 'pickup')).resolves.toBeNull();
    expect(proxy.settings).not.toHaveBeenCalled();
  });

  it.each([403, 429, 502])('lets regular address lookup continue on provider HTTP %i', async status => {
    proxy.fetch.mockResolvedValue(new Response('provider error', { status }));
    await expect(interpretBotAddress('Советская 10', 'pickup')).resolves.toBeNull();
  });

  it('treats invalid model output as an unresolved address', async () => {
    proxy.fetch.mockResolvedValue(response({ latitude: 56, longitude: 52 }, 'Можга'));
    await expect(interpretBotAddress('Советская 10 в Можгу', 'pickup')).resolves.toBeNull();
  });
});
