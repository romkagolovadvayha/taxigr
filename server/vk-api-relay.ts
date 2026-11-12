import type { FastifyInstance } from 'fastify';
import { VkBotTransport } from '../src/api/vk-bot-transport';
import { startBotApiRelay } from './bot-api-relay';

type Options = { token: string; groupId: string; serviceUserId: string; channel: string; secretKey: string };
export function startVkApiRelay(app: FastifyInstance, options: Options): Promise<() => Promise<void>> {
  return startBotApiRelay(app, { api: new VkBotTransport(options), recipientId: options.serviceUserId,
    label: 'VK', channel: options.channel, secretKey: options.secretKey });
}
