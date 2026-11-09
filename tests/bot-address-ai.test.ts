import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const proxy = vi.hoisted(() => ({
  fetch: vi.fn(), dispatcher: vi.fn(), settings: vi.fn(),
  config: { BOT_AI_API_KEY: 'test-key', BOT_AI_BASE_URL: 'https://api.openai.com/v1', BOT_AI_MODEL: 'gpt-4o-mini',
    BOT_AI_PROXY_URL: '', BOT_AI_PROXY_SERVER_NAME: '', BOT_AI_PROXY_USERNAME: '', BOT_AI_PROXY_PASSWORD: '', isProduction: true },
}));
vi.mock('../server/config', () => ({ config: proxy.config }));
vi.mock('../server/gateway-proxy', () => ({ gatewayDispatcher: proxy.dispatcher }));
vi.mock('../server/gateway-settings', () => ({ readGatewaySettings: proxy.settings }));

vi.doMock(createRequire(new URL('../server/bot-address-ai.ts', import.meta.url)).resolve('undici'), () => ({ fetch: proxy.fetch }));
const { interpretBotAddress } = await import('../server/bot-address-ai');

const agent = { name: 'test gateway' };
const response = (pickup: unknown, destination: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ pickup, destination }) } }],
}));

beforeEach(() => {
  vi.resetAllMocks();
  proxy.config.BOT_AI_API_KEY = 'test-key';
  proxy.config.BOT_AI_PROXY_URL = '';
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

  it('passes the dedicated proxy credentials and TLS name without reading Telegram settings', async () => {
    Object.assign(proxy.config, {
      BOT_AI_PROXY_URL: 'https://192.0.2.10', BOT_AI_PROXY_SERVER_NAME: 'proxy.example.com',
      BOT_AI_PROXY_USERNAME: 'booking', BOT_AI_PROXY_PASSWORD: 'test-password',
    });
    proxy.fetch.mockResolvedValue(response('Советская 10', null));
    expect(await interpretBotAddress('Советская 10', 'pickup')).toEqual({ pickup: 'Советская 10', destination: null });
    expect(proxy.settings).not.toHaveBeenCalled();
    expect(proxy.dispatcher).toHaveBeenCalledWith({
      proxyEnabled: true, proxyUrl: 'https://192.0.2.10', proxyUsername: 'booking', proxyPassword: 'test-password',
    }, { scope: 'booking-ai', servername: 'proxy.example.com' });
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
