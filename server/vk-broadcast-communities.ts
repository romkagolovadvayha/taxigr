import { config } from './config';

export type BroadcastCommunity = { key: string; id: string; name: string; token: string };
export function broadcastCommunities(): BroadcastCommunity[] {
  return [
    { key: 'taxi', id: config.VK_COMMUNITY_ID, name: 'Такси Грахово', token: config.VK_BOT_TOKEN },
    { key: 'afisha', id: config.VK_AFISHA_COMMUNITY_ID, name: 'Афиша Грахово', token: config.VK_AFISHA_BOT_TOKEN },
  ];
}
export function broadcastCommunity(key: string): BroadcastCommunity {
  const community = broadcastCommunities().find(c => c.key === key);
  if (!community) throw Object.assign(new Error('Сообщество не найдено'), { statusCode: 404 });
  return community;
}
