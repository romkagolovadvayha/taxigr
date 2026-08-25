import { describe, expect, it } from 'vitest';

import { grahovoDirectoryAddresses } from '../src/data/grahovo-address-directory';
import {
  addressSearchScore,
  rankAddressSearchResults,
  uniqueAddressesByLabel,
} from '../src/domain/address-search';
import { buildStreetSuggestions } from '../src/domain/address-suggestions';
import type { Address } from '../src/domain/models';

const addresses: Address[] = [
  {
    id: 'achintseva-5',
    label: 'с. Грахово, ул. Ачинцева, 5',
    details: 'Граховский район',
    houseNumber: '5',
    coordinates: { latitude: 56.05, longitude: 51.96 },
  },
  {
    id: 'achintseva-street',
    label: 'с. Грахово, ул. Ачинцева',
    details: 'Граховский район · улица',
    coordinates: { latitude: 56.05, longitude: 51.96 },
  },
  {
    id: 'porshur',
    label: 'д. Поршур, ул. Бабаева',
    details: 'Граховский район · улица',
    coordinates: { latitude: 56.02, longitude: 52.02 },
  },
];

describe('address search ranking', () => {
  it('keeps the existing scores and deterministic order', () => {
    const legacy = [...addresses]
      .filter((address) => addressSearchScore(address, 'грахово ачинцева') > 0)
      .sort(
        (left, right) =>
          addressSearchScore(right, 'грахово ачинцева') -
          addressSearchScore(left, 'грахово ачинцева'),
      );

    expect(rankAddressSearchResults(addresses, 'грахово ачинцева')).toEqual(legacy);
  });

  it('keeps the legacy ranking across the real local directory', () => {
    const directory = uniqueAddressesByLabel([
      ...grahovoDirectoryAddresses,
      ...buildStreetSuggestions(grahovoDirectoryAddresses),
    ]);

    for (const query of [
      'поршур',
      'юбилейная 5',
      'грахово',
      'ачинцева',
      'магазин',
      'дорожная 11',
    ]) {
      const legacy = [...directory]
        .filter((address) => addressSearchScore(address, query) > 0)
        .sort(
          (left, right) =>
            addressSearchScore(right, query) - addressSearchScore(left, query),
        )
        .slice(0, 120);

      expect(rankAddressSearchResults(directory, query)).toEqual(legacy);
    }
  });

  it('honors the result limit without changing relevance', () => {
    expect(rankAddressSearchResults(addresses, 'ачин', 1)).toEqual([addresses[0]]);
  });

  it('deduplicates labels in linear first-match order', () => {
    const duplicate = { ...addresses[0], id: 'duplicate', label: addresses[0]!.label.toUpperCase() };
    expect(uniqueAddressesByLabel([...addresses, duplicate]).map((address) => address.id)).toEqual(
      addresses.map((address) => address.id),
    );
  });
});
