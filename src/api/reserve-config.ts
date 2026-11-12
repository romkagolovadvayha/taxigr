import { getMaxRelayClient } from './max-relay-config';
import { getVkRelayClient } from './vk-relay-config';
import type { ReserveClient } from './reserve-coordinator';

export function getReserveClients(): ReserveClient[] {
  const vk = getVkRelayClient(), max = getMaxRelayClient();
  return [...(vk ? [{ name: 'vk' as const, client: vk }] : []),
    ...(max ? [{ name: 'max' as const, client: max }] : [])];
}
export function reserveChannelsEnabled(): boolean { return getReserveClients().length > 0; }
