import type { Address } from '../domain/models';
import { grahovoDirectoryAddresses } from './grahovo-address-directory';
import snapshot from './russia-settlements.json';

// Settlement centre, not a station/street centroid. OpenStreetMap relation 6821105,
// verified through Nominatim on 2026-10-29 (ODbL / OpenStreetMap contributors).
const verifiedSettlements: Address[] = [{
  id: 'osm-settlement:6821105', label: 'г. Можга', kind: 'settlement',
  details: 'Удмуртская Республика · межгород',
  coordinates: { latitude: 56.4490364, longitude: 52.2185947 },
}, {
  id: 'intercity:izhevsk', label: 'г. Ижевск', kind: 'settlement',
  details: 'Удмуртская Республика · межгород',
  coordinates: { latitude: 56.8605175, longitude: 53.1977307 },
}, {
  id: 'intercity:kazan', label: 'г. Казань', kind: 'settlement',
  details: 'Республика Татарстан · межгород',
  coordinates: { latitude: 55.7946485, longitude: 49.1115022 },
}, {
  // Two distinct localities in the Russian State Catalogue of Geographical Names.
  id: 'gkgn:0718981', label: 'п. Кизнер', kind: 'settlement',
  details: 'Удмуртская Республика · межгород',
  coordinates: { latitude: 56.285, longitude: 51.5133333 },
}, {
  id: 'gkgn:0518786', label: 'с. Кизнер', kind: 'settlement',
  details: 'Удмуртская Республика · межгород',
  coordinates: { latitude: 56.3116667, longitude: 51.5133333 },
}];

function localityName(label: string): string {
  return label.toLocaleLowerCase('ru').replace(/ё/gu, 'е').replace(/^(?:г|с|д|п)\.\s*/u, '');
}

const localSettlements = grahovoDirectoryAddresses.filter(address => address.kind === 'settlement');
const existing = [...verifiedSettlements, ...localSettlements];
const existingByName = new Map<string, Address[]>();
for (const address of existing) {
  const name = localityName(address.label);
  existingByName.set(name, [...(existingByName.get(name) ?? []), address]);
}

// Keep the district catalogue and verified centres authoritative. GeoNames
// supplements it with populated places across Russia, including small towns.
export const intercitySettlements: Address[] = [
  ...verifiedSettlements,
  ...snapshot.places.flatMap(row => {
    const [id, name, region, latitude, longitude] = row as [number, string, string, number, number, number];
    const duplicate = existingByName.get(localityName(name))?.some(address =>
      Math.abs(address.coordinates.latitude - latitude) < 0.15 && Math.abs(address.coordinates.longitude - longitude) < 0.2);
    return duplicate ? [] : [{
      id: `geonames:${id}`, label: name, kind: 'settlement' as const,
      details: `${region} · межгород`, coordinates: { latitude, longitude },
    }];
  }),
];

export const intercitySettlementById = new Map(intercitySettlements.map(address => [address.id, address]));
