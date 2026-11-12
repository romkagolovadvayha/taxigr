import { getReserveClients } from './reserve-config';
import { ReserveCoordinator } from './reserve-coordinator';
import type { RelayRequest } from './max-relay-protocol';

const coordinator = new ReserveCoordinator(getReserveClients);
export function requestThroughReserve(request: Omit<RelayRequest, 'id' | 'expiresAt'>, signal?: AbortSignal, timeoutMs?: number) {
  return coordinator.request(request, signal, timeoutMs);
}
