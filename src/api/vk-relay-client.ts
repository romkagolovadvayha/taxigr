import { BotRelayClient, type BotRelayConfig } from './bot-relay-client';
import { VkBotTransport } from './vk-bot-transport';

export type VkRelayConfig = BotRelayConfig & {
  botToken: string; groupId: string; serviceUserId: string; gatewayUrl?: string;
};
export class VkRelayClient extends BotRelayClient {
  constructor(config: VkRelayConfig, fetcher?: typeof fetch) {
    super(config, new VkBotTransport({ token: config.botToken, groupId: config.groupId,
      serviceUserId: config.serviceUserId, gatewayUrl: config.gatewayUrl, fetcher }));
  }
}
