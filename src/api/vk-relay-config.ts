import { VkRelayClient, type VkRelayConfig } from './vk-relay-client';
let instance: VkRelayClient | undefined;
export function readVkRelayConfig(): VkRelayConfig | null {
  if (process.env.EXPO_PUBLIC_VK_RELAY_ENABLED !== '1') return null;
  const channel = process.env.EXPO_PUBLIC_VK_RELAY_CHANNEL;
  const publicKey = process.env.EXPO_PUBLIC_VK_RELAY_PUBLIC_KEY;
  const botToken = process.env.EXPO_PUBLIC_VK_RELAY_BOT_TOKEN ?? '';
  const groupId = process.env.EXPO_PUBLIC_VK_RELAY_GROUP_ID;
  const serviceUserId = process.env.EXPO_PUBLIC_VK_RELAY_SERVICE_USER_ID;
  const gatewayUrl = process.env.EXPO_OS === 'web' ? process.env.EXPO_PUBLIC_VK_RELAY_GATEWAY_URL : undefined;
  if (gatewayUrl && !/^http:\/\/(localhost|127\.0\.0\.1):\d+(?:\/[^?#]*)?$/.test(gatewayUrl)) return null;
  if (!channel || !publicKey || !groupId || !serviceUserId || (!botToken && !gatewayUrl)) return null;
  return { channel, publicKey, botToken, groupId, serviceUserId, gatewayUrl };
}
export function getVkRelayClient(): VkRelayClient | null {
  const config = readVkRelayConfig();
  if (!config) return null;
  try { instance ??= new VkRelayClient(config); } catch { return null; }
  return instance;
}
