import { describe, expect, it } from 'vitest';

import {
  extractQueryHouseNumber,
  extractHouseNumber,
  hasHouseNumber,
  queryHasHouseNumber,
} from '../src/domain/address-precision';

describe('address precision', () => {
  it('recognizes common Russian house-number formats', () => {
    expect(extractHouseNumber({ label: 'ул. Ачинцева, 5' })).toBe('5');
    expect(extractHouseNumber({ label: 'ул. Колпакова, 1Б' })).toBe('1Б');
    expect(extractHouseNumber({ label: '50 лет Победы 19' })).toBe('19');
    expect(extractHouseNumber({ label: 'Советская, 12/1' })).toBe('12/1');
    expect(hasHouseNumber({ label: 'Вокзал', houseNumber: '6' })).toBe(true);
  });

  it('does not confuse street and road names with a house', () => {
    expect(queryHasHouseNumber('50')).toBe(false);
    expect(queryHasHouseNumber('ул. 50')).toBe(false);
    expect(queryHasHouseNumber('улица 50 лет Победы')).toBe(false);
    expect(queryHasHouseNumber('трасса 94Р-16')).toBe(false);
    expect(queryHasHouseNumber('деревня Благодатное')).toBe(false);
    expect(queryHasHouseNumber('железнодорожный вокзал Можга')).toBe(false);
  });

  it('requires both a street name and a trailing house number', () => {
    expect(queryHasHouseNumber('ул. 50 лет Победы, 19')).toBe(true);
    expect(queryHasHouseNumber('Ачинцева 5')).toBe(true);
    expect(extractQueryHouseNumber('Поршур, Бабаева, 99А')).toBe('99А');
  });
});
