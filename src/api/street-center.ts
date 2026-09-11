import { addressSearchScore } from '../domain/address-search';
import type { Address, Coordinates } from '../domain/models';
import { validMapCoordinate } from '../domain/map-coordinates';
import { searchMapAddresses, type MapAddressOptions } from './map-addresses';

export async function resolveStreetCenter(street: Address, options: MapAddressOptions): Promise<Coordinates | null> {
  if (!validMapCoordinate(street.coordinates) || options.signal?.aborted) return null;
  try {
    const addresses = await searchMapAddresses(street.label, options, 'street');
    if (options.signal?.aborted) return null;
    for (const item of addresses) {
      if (item.kind !== 'street' || addressSearchScore(item, street.label) === 0 || !validMapCoordinate(item.coordinates)) continue;
      // Common street names must stay near the selected settlement.
      const latitudeDelta = item.coordinates.latitude - street.coordinates.latitude;
      const longitudeDelta = (item.coordinates.longitude - street.coordinates.longitude) * Math.cos(street.coordinates.latitude * Math.PI / 180);
      if (Math.hypot(latitudeDelta, longitudeDelta) * 111_320 > 15_000) continue;
      return item.coordinates;
    }
    return null;
  } catch { return null; }
}
