import { hasApproximateCoordinates, extractQueryHouseNumber } from './address-precision';
import { chooseBotAddress, normalizeBotAddress } from './free-text-address';
import type { Address } from './models';

export function addressSuggestionKey(address: Address): string {
  return address.placeId ? `place:${address.placeId}` : address.label.toLocaleLowerCase('ru').replace(/ё/gu, 'е').replace(/\s+/gu, ' ').trim();
}

/** Keep the known house point when the geocoder also returns its street centre. */
export function mergeAddressSuggestions(primary: Address[], secondary: Address[]): Address[] {
  const result = new Map<string, Address>();
  for (const address of [...primary, ...secondary]) {
    const key = addressSuggestionKey(address);
    const previous = result.get(key);
    if (!previous || (hasApproximateCoordinates(previous) && !hasApproximateCoordinates(address))) result.set(key, address);
  }
  return [...result.values()];
}

export function selectUnambiguousAddress(query: string, candidates: Address[], pickup: boolean): Address | null {
  const merged = mergeAddressSuggestions(candidates, []);
  const houses = extractQueryHouseNumber(normalizeBotAddress(query)) ? merged.filter(address => !address.placeId) : [];
  return chooseBotAddress(query, houses.length ? houses : merged, pickup);
}
