import { intercitySettlements } from '../data/intercity-settlements';
import type { Address } from './models';
import { addressQueryVariants, addressWordsMatch, hasZarechnyAlias, normalizeBotAddress } from './free-text-address';

function normalizeName(value: string): string {
  return normalizeBotAddress(value).replace(/^(?:город|г|село|с|деревня|д|поселок|п)\s+/u, '');
}

const index = intercitySettlements.map(address => ({ address, name: normalizeName(address.label) }));
const cache = new Map<string, Address[]>();

/** Locality names use a cheap prefix index; never fuzzy-scan every Russian town per keystroke. */
export function searchIntercitySettlements(query: string, limit = 30): Address[] {
  if (hasZarechnyAlias(query)) return [];
  const variants = addressQueryVariants(query).map(normalizeName).filter(name => name.length >= 2);
  const key = JSON.stringify([variants, limit]);
  const cached = cache.get(key);
  if (cached) return cached;
  const matches = index.map(item => ({ ...item, score: Math.max(0, ...variants.map(name =>
    name === item.name ? 4 : name.startsWith(item.name + ' ') ? 3 : item.name.startsWith(name) ? 2
      : name.length >= 4 && name.slice(0, 3) === item.name.slice(0, 3) && addressWordsMatch(name, item.name) ? 1 : 0)) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.address);
  if (cache.size >= 100) cache.clear();
  cache.set(key, matches);
  return matches;
}
