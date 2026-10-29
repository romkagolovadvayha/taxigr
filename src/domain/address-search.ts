import type { Address } from './models';
import { extractHouseNumber, extractQueryHouseNumber, normalizeHouseNumber } from './address-precision';
import { addressWordsMatch, addressQueryVariants, normalizeBotAddress } from './free-text-address';

type SearchableAddress = Pick<Address, 'label' | 'details' | 'kind'>;

export function isIntercitySettlement(address: SearchableAddress): boolean {
  return address.kind === 'settlement' && !/грахово|граховск/iu.test(`${address.label} ${address.details ?? ''}`);
}

export function filterRequestedHouse<T extends SearchableAddress>(addresses: T[], query: string): T[] {
  const house = normalizeHouseNumber(extractQueryHouseNumber(normalizeBotAddress(query)));
  return house ? addresses.filter(address => isIntercitySettlement(address) || normalizeHouseNumber(extractHouseNumber(address)) === house) : addresses;
}

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
  'г', 'город', 'п', 'поселок', 'в', 'на', 'до', 'от', 'из', 'хочу', 'поехать', 'ехать', 'мне', 'я', 'такси', 'нужно', 'надо', 'пожалуйста', 'зд', 'здание', 'стр', 'строение',
]);

const INFRASTRUCTURE_TOKENS = new Set([
  'автодорога',
  'дорога',
  'трасса',
  'шоссе',
]);

function tokens(value: string): string[] {
  return normalizeBotAddress(value)
    .replace(/(?<=[а-я])-(?=[а-я])/gu, ' ')
    .replace(/[^\p{L}\p{N}/-]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => (token.length > 1 || /^\d$/u.test(token)) && !IGNORED_TOKENS.has(token));
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
  if (isIntercitySettlement(address) && index.labelTokens.length && index.labelTokens.every(name =>
    queryTokens.some(word => word === name || addressWordsMatch(word, name)))) return 100;
  if (
    queryTokens.length === 1 &&
    !INFRASTRUCTURE_TOKENS.has(queryTokens[0]!) &&
    index.labelTokens.some((token) => INFRASTRUCTURE_TOKENS.has(token))
  ) {
    return 0;
  }
  let score = 0;

  for (const queryToken of queryTokens) {
    if (index.haystackTokens.includes(queryToken)) score += 20;
    else if (index.haystackTokens.some((token) => token.startsWith(queryToken))) score += 5;
    else if (index.haystackTokens.some((token) => addressWordsMatch(queryToken, token))) score += 3;
    else return 0;
  }

  if (queryTokens.every((token) => index.labelTokens.includes(token))) score += 30;
  return score;
}

export function addressSearchScore(address: SearchableAddress, query: string): number {
  return Math.max(...addressQueryVariants(query).map(variant => scoreAddressTokens(address, tokens(variant))));
}

export function uniqueAddressesByLabel<T extends SearchableAddress>(addresses: readonly T[]): T[] {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const label = address.label.toLowerCase();
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
  const queryTokens = addressQueryVariants(query).map(tokens);
  if (!queryTokens.some(part => part.length) || limit <= 0) return [];

  return filterRequestedHouse([...addresses], query)
    .map((address, position) => ({
      address,
      position,
      score: Math.max(...queryTokens.map(part => scoreAddressTokens(address, part))),
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .slice(0, limit)
    .map((result) => result.address);
}
