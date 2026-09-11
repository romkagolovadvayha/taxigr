import { extractQueryHouseNumber, hasHouseNumber } from './address-precision';
import type { Address } from './models';

const IGNORED_TOKENS = new Set([
  'д',
  'дом',
  'деревня',
  'с',
  'село',
  'ул',
  'улица',
  'пер',
  'переулок',
  'граховский',
  'район',
  'удмуртская',
  'республика',
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token));
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

const anchorTokenCache = new WeakMap<Address, Set<string>>();

function addressTokens(address: Address): Set<string> {
  const cached = anchorTokenCache.get(address);
  if (cached) return cached;
  const indexed = new Set(tokens(`${address.label} ${address.details ?? ''}`));
  anchorTokenCache.set(address, indexed);
  return indexed;
}

function manualId(value: string): string {
  return `manual:${value
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')}`;
}

export function findBestAddressAnchor(query: string, addresses: readonly Address[]): Address | null {
  const queryTokens = tokens(query).filter((token) => !/^\d/iu.test(token));
  if (!queryTokens.length) return null;

  let best: { address: Address; score: number } | null = null;
  for (const address of addresses) {
    if (hasHouseNumber(address)) continue;
    const haystack = addressTokens(address);
    const matches = queryTokens.filter((token) => haystack.has(token)).length;
    if (!matches) continue;
    const score =
      queryTokens.reduce(
        (total, token, index) =>
          total + (haystack.has(token) ? (queryTokens.length - index) * 10 : 0),
        0,
      ) + (matches === queryTokens.length ? 5 : 0);
    if (!best || score > best.score) best = { address, score };
  }
  return best?.address ?? null;
}

export function buildManualAddress(query: string, anchor: Address | null): Address | null {
  const houseNumber = extractQueryHouseNumber(query);
  if (!houseNumber || !anchor) return null;

  let label = normalizeLabel(query);
  const locality = anchor.label.split(',')[0]!;
  const localityName = locality.replace(/^(?:д|с|г|п|деревня|село|город|пос[её]лок)\.?\s+/iu, '');
  // A street-only query still needs its selected locality in the saved address.
  if (!label.includes(',') && !label.toLocaleLowerCase('ru').includes(localityName.toLocaleLowerCase('ru'))) {
    label = `${locality}, ${label}`;
  }
  return {
    id: manualId(label),
    label,
    houseNumber,
    coordinatePrecision: 'approximate',
    details: `${anchor.label}, ${anchor.details?.split('·')[0]?.trim() ?? ''} · Введено вручную · точка приблизительная`,
    coordinates: anchor.coordinates,
  };
}
