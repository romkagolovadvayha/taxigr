import { describe, expect, it } from 'vitest';
import { grahovoAddressCatalog as catalog } from '../src/data/grahovo-address-catalog';
import { rankAddressSearchResults } from '../src/domain/address-search';
import { rankBotAddresses } from '../src/domain/free-text-address';

const messy = (label: string) => label.toLowerCase()
  .replace(/(?:^|[\s,])(?:с\.|д\.|ул\.|пер\.|зд\.)\s*/gu, ' ')
  .replace(/[,.-]/gu, ' ').replace(/\s+/gu, ' ').trim()
  .replace(/\s+(\d+[а-я]?)$/u, '$1');

describe('exhaustive Grahovo district catalogue search', () => {
  it('finds every directory entry by its full label in the app', () => {
    const missing = catalog.filter(address => !rankAddressSearchResults(catalog, address.label)
      .some(found => found.id === address.id)).map(address => address.label);
    expect(missing).toEqual([]);
  }, 120_000);

  it('recognizes every house and settlement in bots without address formatting', () => {
    const missing: string[] = [];
    for (const address of catalog.filter(item => item.houseNumber || item.kind === 'settlement')) {
      const query = messy(address.label);
      const ranked = rankBotAddresses(query, catalog, false, true);
      if (!ranked.some(found => found.address.id === address.id && ranked[0]!.score - found.score < 2)) missing.push(`${query} => ${address.label}`);
    }
    expect(missing).toEqual([]);
  }, 120_000);
});
