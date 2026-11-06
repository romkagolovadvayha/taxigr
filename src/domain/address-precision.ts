import { grahovoDirectoryAddresses } from '../data/grahovo-address-directory';

type AddressLike = {
  id?: string;
  label: string;
  details?: string;
  houseNumber?: string;
  placeId?: string;
  kind?: 'house' | 'street' | 'settlement' | 'place';
  coordinatePrecision?: 'approximate' | 'precise';
};

const HOUSE_NUMBER = String.raw`\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?(?:\s+(?:к(?:орп(?:ус)?)?\.?|стр(?:оение)?\.?)\s*\d+[а-яa-z]?)?`;
const ROAD_CODE = /^\d{1,3}[рк]-\d+$/iu;
const TRAILING_HOUSE = new RegExp(String.raw`(?:,\s*|\s+)(${HOUSE_NUMBER})\s*$`, 'iu');
const EXPLICIT_HOUSE = new RegExp(String.raw`\b(?:дом|д\.)\s*(${HOUSE_NUMBER})(?:\b|$)`, 'iu');
const districtLocalities = grahovoDirectoryAddresses.filter(address => address.kind === 'settlement').map(({ label }) => label
  .replace(/^\S+\s+/u, '').replace(/ё/giu, 'е').split(/[\s-]+/u)
  .map(word => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join(String.raw`[-–—\s]+`));
const DISTRICT_LOCALITY_SUFFIX = new RegExp(
  String.raw`[,\s]+(?:(?:село|деревня|поселок|[сдп])\.?\s+)?(?:${districtLocalities.join('|')})$`, 'iu',
);

const normalizedHouses = new Map<string, string>();
export function normalizeHouseNumber(value: string | null | undefined): string {
  if (!value) return '';
  const existing = normalizedHouses.get(value);
  if (existing !== undefined) return existing;
  const normalized = value.toLocaleLowerCase('ru').replace(/корп(?:ус)?\.?/gu, 'к')
    .replace(/строение/gu, 'стр').replace(/[.\s]/gu, '');
  if (normalizedHouses.size >= 1_000) normalizedHouses.clear();
  normalizedHouses.set(value, normalized);
  return normalized;
}

export function extractHouseNumber(address: AddressLike): string | null {
  const structured = address.houseNumber?.trim();
  if (structured) return structured;

  const label = address.label.trim().replace(/\s+/g, ' ');
  const trailing = label.match(TRAILING_HOUSE);
  const candidate = trailing?.[1];
  if (candidate && !ROAD_CODE.test(candidate)) return candidate;

  const details = address.details?.trim() ?? '';
  const explicit = details.match(EXPLICIT_HOUSE);
  return explicit?.[1] ?? null;
}

export function hasHouseNumber(address: AddressLike | null | undefined): boolean {
  return !!address && extractHouseNumber(address) !== null;
}

export function isPickupAddressComplete(address: AddressLike | null | undefined): boolean {
  return !!address && !hasApproximateCoordinates(address) && (
    hasHouseNumber(address) ||
    Boolean(address.placeId) ||
    (address.kind === 'place' && address.coordinatePrecision === 'precise' &&
      address.id?.startsWith('location:') === true)
  );
}

export function hasApproximateCoordinates(address: AddressLike): boolean {
  return address.coordinatePrecision === 'approximate' ||
    /^(?:gar|manual):/u.test(address.id ?? '') ||
    /точка приблизительная/iu.test(address.details ?? '');
}

export function isDestinationAddressComplete(
  address: AddressLike | null | undefined,
): boolean {
  return isPickupAddressComplete(address) || address?.kind === 'settlement';
}

export function isDirectoryHouseEstimate(address: AddressLike | null | undefined): boolean {
  return address?.kind === 'house' && address.id?.startsWith('gar:') === true &&
    address.coordinatePrecision === 'approximate' && Boolean(address.houseNumber);
}

export function isPickupAddressBookable(address: AddressLike | null | undefined): boolean {
  return isPickupAddressComplete(address) || isDirectoryHouseEstimate(address);
}

export function isDestinationAddressBookable(address: AddressLike | null | undefined): boolean {
  return isDestinationAddressComplete(address) || isDirectoryHouseEstimate(address);
}

export function queryHasHouseNumber(query: string): boolean {
  return extractQueryHouseNumber(query) !== null;
}

export function extractQueryHouseNumber(query: string): string | null {
  return parseQueryHouse(query)?.houseNumber ?? null;
}

export function parseQueryHouse(query: string): { houseNumber: string; streetPart: string } | null {
  const normalized = query.trim().replace(/\s+/g, ' ');
  const trailing = normalized.match(TRAILING_HOUSE);
  const locality = trailing ? null : normalized.replace(/ё/giu, 'е').match(DISTRICT_LOCALITY_SUFFIX);
  const match = trailing ?? (locality ? normalized.slice(0, locality.index).match(TRAILING_HOUSE) : null);
  if (!match?.[1] || match.index == null || ROAD_CODE.test(match[1])) return null;

  const street = normalized.slice(0, match.index).replace(/[,\s]+$/gu, '');
  const streetLetters = street
    .replace(
      /(?:^|[\s,])(?:ул(?:ица)?|пер(?:еулок)?|пр(?:оспект)?|ш(?:оссе)?|наб(?:ережная)?|проезд)\.?/giu,
      ' ',
    )
    .replace(/[^\p{L}]+/gu, '');
  if (streetLetters.length < 2) return null;
  const localityText = locality?.index === undefined ? '' : normalized.slice(locality.index).replace(/^[,\s]+/gu, '');
  return { houseNumber: match[1], streetPart: localityText ? `${street}, ${localityText}` : street };
}
