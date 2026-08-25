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
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token));
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

function manualId(value: string): string {
  return `manual:${value
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')}`;
}

export function findBestAddressAnchor(query: string, addresses: Address[]): Address | null {
  const queryTokens = tokens(query).filter((token) => !/^\d/iu.test(token));
  if (!queryTokens.length) return null;

  let best: { address: Address; score: number } | null = null;
  for (const address of addresses) {
    if (hasHouseNumber(address)) continue;
    const haystack = new Set(tokens(`${address.label} ${address.details ?? ''}`));
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

  const label = normalizeLabel(query);
  return {
    id: manualId(label),
    label,
    houseNumber,
    details: 'Введено вручную · точка приблизительная, водитель уточнит адрес',
    coordinates: anchor.coordinates,
  };
}
