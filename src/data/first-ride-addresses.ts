import type { Address } from '@/domain/models';

// The identifiers are the canonical entries in the service's place directory.
export const firstRideAddresses: Address[] = [
  { id: 'place:00000000-0000-4000-8000-064863530850', placeId: '00000000-0000-4000-8000-064863530850',
    label: 'Пятёрочка', details: 'ул. Советская, 15А · Грахово', houseNumber: '15А', kind: 'place',
    coordinates: { latitude: 56.044885, longitude: 51.962273 } },
  { id: 'place:00000000-0000-4000-8000-021870272900', placeId: '00000000-0000-4000-8000-021870272900',
    label: 'Максимум', details: 'ул. Дорожная, 13 · Грахово', houseNumber: '13', kind: 'place',
    coordinates: { latitude: 56.042350, longitude: 51.981392 } },
];
