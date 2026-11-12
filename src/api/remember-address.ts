import type { Address, Coordinates } from '../domain/models';
import { confirmAddressPoint } from '../domain/route-stops';
import { rememberDemoAddress } from '../storage/demo-address-points';
import { apiRequest, isConnectionFailure } from './client';
import { isServerReachable } from '../offline/connectivity';

export async function rememberAddressPoint(address: Address, coordinates: Coordinates, token: string | null): Promise<Address> {
  // Directory places retain their separate managed identity.
  if (address.placeId) return confirmAddressPoint(address, coordinates);
  if (!token) throw new Error('Войдите в аккаунт, чтобы сохранить адрес');
  if (token.startsWith('demo:')) return rememberDemoAddress(address, coordinates);
  if (!isServerReachable()) return confirmAddressPoint(address,coordinates);
  try {
    return await apiRequest<Address>('/v1/addresses/points', {
      method: 'POST', token, body: JSON.stringify({ address, coordinates }),
    });
  } catch (error) {
    if (isConnectionFailure(error)) return confirmAddressPoint(address,coordinates);
    throw error;
  }
}
