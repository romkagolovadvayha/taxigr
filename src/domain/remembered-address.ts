import { extractHouseNumber, hasApproximateCoordinates } from './address-precision';
import type { Address, Coordinates } from './models';
import { distanceBetweenCoordinates } from './navigation';
import { confirmAddressPoint } from './route-stops';

/** Keep locality, road type, house suffixes and separators in the identity. */
export function houseAddressKey(address: Pick<Address, 'label' | 'houseNumber'>): string | null {
  const house = extractHouseNumber(address)?.toLocaleLowerCase('ru').replace(/ё/gu, 'е');
  if (!house) return null;
  const label = address.label.toLocaleLowerCase('ru').replace(/ё/gu, 'е')
    .replace(/(?:^|[\s,])(?:деревня|село|город|поселок|д|с|г|п)\.?\s+(?=\p{L})/gu, ' ')
    .replace(/(?:^|[\s,])(?:улица|ул)\.?(?=[\s,]|$)/gu, ' ')
    .replace(/(?:^|[\s,])(?:переулок|пер)\.?(?=[\s,]|$)/gu, ' переулок ')
    .replace(/(?:^|[\s,])(?:дом|д)\.?\s*(?=\d)/gu, ' ')
    .replace(/[.,\s]+/gu, ' ').trim();
  return `${label}|${house}`;
}

export function rememberedHouse(address: Address, coordinates: Coordinates, id: string): Address {
  return { ...confirmAddressPoint(address, coordinates), id, kind: 'house',
    houseNumber: extractHouseNumber(address) ?? undefined,
    place: undefined, placeId: undefined };
}

/** Reliable map data wins; a remembered point replaces only an approximate anchor. */
export function overlayRememberedAddresses(directory: readonly Address[], remembered: readonly Address[]): Address[] {
  if (!remembered.length) return [...directory];
  const points = new Map(remembered.map(address => [houseAddressKey(address), address]));
  const used = new Set<string>();
  const result = directory.map(address => {
    const key = houseAddressKey(address);
    const point = key ? points.get(key) : undefined;
    if (!key || !point || distanceBetweenCoordinates(address.coordinates, point.coordinates) > 15_000) return address;
    used.add(key);
    return hasApproximateCoordinates(address) ? point : address;
  });
  return [...result, ...remembered.filter(address => {
    const key = houseAddressKey(address);
    return key && !used.has(key);
  })];
}
