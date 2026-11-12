import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVkRelayConfig } from '../src/api/vk-relay-config';
import { readMaxRelayConfig } from '../src/api/max-relay-config';
import { VkBotTransport } from '../src/api/vk-bot-transport';
import { MaxBotTransport } from '../src/api/max-bot-transport';

afterEach(()=>vi.unstubAllEnvs());
describe('native channels never depend on a loopback or taxi proxy',()=>{
  it.each(['ios','android'])('ignores every test gateway in a %s build',platform=>{
    vi.stubEnv('EXPO_OS',platform);
    for (const service of ['VK','MAX']) {
      vi.stubEnv(`EXPO_PUBLIC_${service}_RELAY_ENABLED`,'1');
      vi.stubEnv(`EXPO_PUBLIC_${service}_RELAY_BOT_TOKEN`,'fake-native-token');
      vi.stubEnv(`EXPO_PUBLIC_${service}_RELAY_CHANNEL`,'test');
      vi.stubEnv(`EXPO_PUBLIC_${service}_RELAY_PUBLIC_KEY`,'test-public-key');
      vi.stubEnv(`EXPO_PUBLIC_${service}_RELAY_SERVICE_USER_ID`,'123');
      vi.stubEnv(`EXPO_PUBLIC_${service}_RELAY_GATEWAY_URL`,'http://127.0.0.1:4213/vk');
    }
    vi.stubEnv('EXPO_PUBLIC_VK_RELAY_GROUP_ID','456');vi.stubEnv('EXPO_PUBLIC_MAX_RELAY_CHAT_ID','789');
    expect(readVkRelayConfig()).toMatchObject({botToken:'fake-native-token',gatewayUrl:undefined});
    expect(readMaxRelayConfig()).toMatchObject({botToken:'fake-native-token',gatewayUrl:undefined});
  });
  it('calls the official VK endpoint directly',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{"response":{"items":[]}}'));
    await new VkBotTransport({token:'fake-token',groupId:'456',serviceUserId:'123',fetcher}).read(['42']);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.vk.ru/method/messages.getById');
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer fake-token');
  });
  it('calls the official MAX endpoint directly',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{"messages":[]}'));
    await new MaxBotTransport({token:'fake-token',chatId:'789',serviceUserId:'123',fetcher}).read(['42']);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://platform-api2.max.ru/messages?message_ids=42');
  });
});
