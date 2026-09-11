import { describe, expect, it } from 'vitest';
import { importOsmHouses, normalizedStreet, type OsmElement } from '../scripts/lib/osm-house-import';
import type { Address } from '../src/domain/models';

const directory: Address[] = [
  { id: 'village', label: 'с. Грахово', kind: 'settlement', coordinates: { latitude: 56, longitude: 52 } },
  { id: 'gar:1', label: 'с. Грахово, ул. Берёзовая, 1', houseNumber: '1', coordinates: { latitude: 56, longitude: 52 } },
];
const polygon: OsmElement = { type: 'way', id: 1, tags: { name: 'Грахово', place: 'village' }, geometry: [
  { lat: 55.99, lon: 51.99 }, { lat: 56.01, lon: 51.99 }, { lat: 56.01, lon: 52.01 },
  { lat: 55.99, lon: 52.01 }, { lat: 55.99, lon: 51.99 },
] };
const house: OsmElement = { type: 'node', id: 2, lat: 56, lon: 52, tags: { 'addr:street': 'Березовая улица', 'addr:housenumber': '1' } };

describe('OSM house import validation', () => {
  it('matches a tagged number and street using the containing settlement polygon', () => {
    expect(importOsmHouses([polygon, house], directory).points[0]).toMatchObject({ garId: 'gar:1', label: directory[1]!.label,
      sourceUrl: 'https://www.openstreetmap.org/node/2' });
  });
  it('does not equate a lane with a similarly named street', () => {
    expect(normalizedStreet('Берёзовая улица')).toBe(normalizedStreet('ул. Березовая'));
    expect(normalizedStreet('Березовый переулок')).not.toBe(normalizedStreet('Березовая улица'));
  });
  it('rejects an address outside all settlement polygons', () => {
    expect(importOsmHouses([polygon, { ...house, lat: 56.02 }], directory).points).toEqual([]);
  });
  it('rejects malformed geometry and demolished buildings', () => {
    expect(importOsmHouses([polygon, { ...house, lat: NaN }], directory).points).toEqual([]);
    expect(importOsmHouses([polygon, { ...house, tags: { ...house.tags, 'demolished:building': 'yes' } }], directory).points).toEqual([]);
  });
  it('rejects conflicting distant points and ambiguous house numbers', () => {
    expect(importOsmHouses([polygon, house, { ...house, id: 3, lat: 56.005 }], directory).points).toEqual([]);
    expect(importOsmHouses([polygon, { ...house, tags: { ...house.tags, 'addr:housenumber': '1;3' } }], directory).points).toEqual([]);
  });
  it('does not attach the same number to multiple GAR object types', () => {
    const ambiguous = [...directory, { ...directory[1]!, id: 'gar:building-1', label: 'с. Грахово, ул. Берёзовая, зд. 1' }];
    expect(importOsmHouses([polygon, house], ambiguous).points).toEqual([]);
  });
});
