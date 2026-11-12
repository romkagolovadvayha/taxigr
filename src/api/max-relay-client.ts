import { BotRelayClient, type BotRelayConfig } from './bot-relay-client';
import { MaxBotTransport } from './max-bot-transport';

export type MaxRelayConfig = BotRelayConfig & {
  botToken: string; chatId: string; serviceUserId: string; gatewayUrl?: string;
};
export class MaxRelayClient extends BotRelayClient {
  constructor(config: MaxRelayConfig, fetcher?: typeof fetch) {
    super(config, new MaxBotTransport({ token: config.botToken, chatId: config.chatId,
      serviceUserId: config.serviceUserId, gatewayUrl: config.gatewayUrl, fetcher }));
  }
}
