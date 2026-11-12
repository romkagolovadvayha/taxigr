import { MaxRelayClient, type MaxRelayConfig } from './max-relay-client';
let instance: MaxRelayClient | undefined;
export function readMaxRelayConfig(): MaxRelayConfig | null {
  if (process.env.EXPO_PUBLIC_MAX_RELAY_ENABLED !== '1') return null;
  const channel = process.env.EXPO_PUBLIC_MAX_RELAY_CHANNEL;
  const publicKey = process.env.EXPO_PUBLIC_MAX_RELAY_PUBLIC_KEY;
  const botToken = process.env.EXPO_PUBLIC_MAX_RELAY_BOT_TOKEN ?? '';
  const chatId = process.env.EXPO_PUBLIC_MAX_RELAY_CHAT_ID;
  const serviceUserId = process.env.EXPO_PUBLIC_MAX_RELAY_SERVICE_USER_ID;
  const gatewayUrl = process.env.EXPO_OS === 'web' ? process.env.EXPO_PUBLIC_MAX_RELAY_GATEWAY_URL : undefined;
  // The loopback gateway is for local browser testing only; never use a public
  // proxy that depends on the primary API being reachable.
  if (gatewayUrl && !/^http:\/\/(localhost|127\.0\.0\.1):\d+(?:\/[^?#]*)?$/.test(gatewayUrl)) return null;
  if (!channel || !publicKey || !chatId || !serviceUserId || (!botToken && !gatewayUrl)) return null;
  return { channel, publicKey, botToken, chatId, serviceUserId, gatewayUrl };
}
export function maxRelayEnabled(): boolean { return getMaxRelayClient() !== null; }
export function getMaxRelayClient(): MaxRelayClient | null {
  const config = readMaxRelayConfig();
  if (!config) return null;
  try { instance ??= new MaxRelayClient(config); } catch { return null; }
  return instance;
}
