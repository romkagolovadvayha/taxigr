import type { Address, Coordinates } from '../domain/models';
import { confirmAddressPoint } from '../domain/route-stops';
import { rememberDemoAddress } from '../storage/demo-address-points';
import { apiRequest } from './client';

export async function rememberAddressPoint(address: Address, coordinates: Coordinates, token: string | null): Promise<Address> {
  // Directory places retain their separate managed identity.
  if (address.placeId) return confirmAddressPoint(address, coordinates);
  if (!token) throw new Error('Войдите в аккаунт, чтобы сохранить адрес');
  if (token.startsWith('demo:')) return rememberDemoAddress(address, coordinates);
  return apiRequest<Address>('/v1/addresses/points', {
    method: 'POST', token, body: JSON.stringify({ address, coordinates }),
  });
}
