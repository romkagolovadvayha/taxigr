import { describe, expect, it } from 'vitest';

import { formatAddressSuggestionLines } from '../src/domain/address-suggestion-display';
import type { Address } from '../src/domain/models';

describe('address suggestion display', () => {
  it('shows street and house above locality and district', () => {
    expect(
      formatAddressSuggestionLines({
        label: 'с. Грахово, ул. Ачинцева, 5',
        houseNumber: '5',
        details: 'Граховский район, Удмуртская Республика · точка дома',
      }),
    ).toEqual({
      primary: 'ул. Ачинцева, 5',
      secondary: 'с. Грахово, Граховский район',
    });
  });

  it('uses the city and district returned by the geocoder', () => {
    expect(
      formatAddressSuggestionLines({
        label: 'Советская улица, 10',
        houseNumber: '10',
        details: 'Ижевск, Первомайский район, Удмуртская Республика, Россия',
      }),
    ).toEqual({
      primary: 'Советская улица, 10',
      secondary: 'Ижевск, Первомайский район',
    });
  });

  it('handles a street suffix and does not repeat a settlement-only label', () => {
    expect(
      formatAddressSuggestionLines({
        label: 'г. Можга, Привокзальная ул.',
        details: 'Удмуртская Республика · улица',
      }),
    ).toEqual({
      primary: 'Привокзальная ул.',
      secondary: 'г. Можга',
    });

    expect(
      formatAddressSuggestionLines({
        label: 'с. Грахово',
        details: 'Граховский район, Удмуртская Республика · населённый пункт из ГАР',
      }),
    ).toEqual({
      primary: 'с. Грахово',
      secondary: 'Граховский район',
    });
  });

  it('shows a place name above its street, house and district', () => {
    const place = {
      id: 'shop',
      name: 'Наш магазин',
      aliases: [],
      category: 'shopping',
      addressLabel: 'ул. Колпакова, 4А',
      houseNumber: '4А',
      coordinates: { latitude: 56.045798, longitude: 51.960742 },
      socialLinks: [],
      photoUrls: [],
      schedule: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      active: true,
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    } satisfies NonNullable<Address['place']>;

    expect(
      formatAddressSuggestionLines({
        label: 'Наш магазин, с. Грахово, ул. Колпакова, 4А',
        houseNumber: '4А',
        details: 'Магазины · с. Грахово, ул. Колпакова, 4А',
        place,
      }),
    ).toEqual({
      primary: 'Наш магазин',
      secondary: 'ул. Колпакова, 4А, Граховский район',
    });
  });
});
