import type { Address } from './models';

type SearchableAddress = Pick<Address, 'label' | 'details'>;

type SearchIndex = {
  labelTokens: string[];
  haystackTokens: string[];
};

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
  'район',
]);

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token));
}

const searchIndexCache = new WeakMap<object, SearchIndex>();

function searchIndex(address: SearchableAddress): SearchIndex {
  const cached = searchIndexCache.get(address);
  if (cached) return cached;

  const labelTokens = tokens(address.label);
  const haystackTokens = tokens(`${address.label} ${address.details ?? ''}`);
  const index = {
    labelTokens,
    haystackTokens,
  };
  searchIndexCache.set(address, index);
  return index;
}

function scoreAddressTokens(address: SearchableAddress, queryTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const index = searchIndex(address);
  let score = 0;

  for (const queryToken of queryTokens) {
    if (index.haystackTokens.includes(queryToken)) score += 20;
    else if (index.haystackTokens.some((token) => token.startsWith(queryToken))) score += 5;
    else return 0;
  }

  if (queryTokens.every((token) => index.labelTokens.includes(token))) score += 30;
  return score;
}

export function addressSearchScore(address: SearchableAddress, query: string): number {
  return scoreAddressTokens(address, tokens(query));
}

export function uniqueAddressesByLabel<T extends SearchableAddress>(addresses: readonly T[]): T[] {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const label = address.label.toLocaleLowerCase('ru');
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

export function rankAddressSearchResults<T extends SearchableAddress>(
  addresses: readonly T[],
  query: string,
  limit = 120,
): T[] {
  const queryTokens = tokens(query);
  if (!queryTokens.length || limit <= 0) return [];

  return addresses
    .map((address, position) => ({
      address,
      position,
      score: scoreAddressTokens(address, queryTokens),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .slice(0, limit)
    .map((result) => result.address);
}
