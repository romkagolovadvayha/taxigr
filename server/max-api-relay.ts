import type { FastifyInstance } from 'fastify';
import { MaxBotTransport } from '../src/api/max-bot-transport';
import { startBotApiRelay } from './bot-api-relay';

type Options = { token: string; chatId: string; serviceUserId: string; channel: string; secretKey: string };
export function startMaxApiRelay(app: FastifyInstance, options: Options): Promise<() => Promise<void>> {
  return startBotApiRelay(app, { api: new MaxBotTransport(options), recipientId: options.chatId,
    label: 'MAX', channel: options.channel, secretKey: options.secretKey });
}
