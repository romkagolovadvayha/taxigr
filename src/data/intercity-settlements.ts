import type { Address } from '../domain/models';

// Settlement centre, not a station/street centroid. OpenStreetMap relation 6821105,
// verified through Nominatim on 2026-10-29 (ODbL / OpenStreetMap contributors).
export const intercitySettlements: Address[] = [{
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
}];
