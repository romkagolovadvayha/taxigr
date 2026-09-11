import type { Address } from '../domain/models';
import { extractHouseNumber, hasApproximateCoordinates, isPickupAddressComplete } from '../domain/address-precision';
import { addressSearchScore } from '../domain/address-search';
import { searchMapAddresses, type MapAddressOptions } from './map-addresses';

export async function resolveHouseAddress(address: Address, options: MapAddressOptions): Promise<Address | null> {
  if (!hasApproximateCoordinates(address)) return address;
  const house = extractHouseNumber(address)?.toLocaleLowerCase('ru');
  if (!house || options.signal?.aborted) return null;
  try {
    const candidates = await searchMapAddresses(address.label, options, 'house');
    if (options.signal?.aborted) return null;
    const matches = candidates.filter(candidate => isPickupAddressComplete(candidate) &&
      extractHouseNumber(candidate)?.toLocaleLowerCase('ru') === house &&
      addressSearchScore(candidate, address.label) > 0 &&
      Number.isFinite(candidate.coordinates?.latitude) && Number.isFinite(candidate.coordinates?.longitude) &&
      Math.hypot((candidate.coordinates.latitude - address.coordinates.latitude) * 111_000,
        (candidate.coordinates.longitude - address.coordinates.longitude) * 62_000) < 15_000);
    // Multiple distant matches are ambiguous, even if the address text is identical.
    const first = matches[0];
    if (!first || matches.some(candidate => Math.hypot(
      (candidate.coordinates.latitude - first.coordinates.latitude) * 111_000,
      (candidate.coordinates.longitude - first.coordinates.longitude) * 62_000) > 80)) return null;
    return { ...first, label: address.label, houseNumber: address.houseNumber, kind: 'house', coordinatePrecision: 'precise' };
  } catch { return null; }
}
