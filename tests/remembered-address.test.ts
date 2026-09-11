import { describe, expect, it } from 'vitest';
import type { Address } from '../src/domain/models';
import { houseAddressKey, overlayRememberedAddresses, rememberedHouse } from '../src/domain/remembered-address';
import { buildManualAddress } from '../src/domain/manual-address';
import { grahovoAddressCatalog } from '../src/data/grahovo-address-catalog';

const approximate: Address = { id: 'gar:example', label: 'д. Благодатное, ул. Благодатновская, 1', houseNumber: '1',
  coordinatePrecision: 'approximate', coordinates: { latitude: 56, longitude: 51.87 } };
const point = rememberedHouse(approximate, { latitude: 56.001, longitude: 51.871 }, 'saved-house:test');

describe('remembered house identity', () => {
  it('matches spelling, abbreviation and punctuation variants', () => {
    expect(houseAddressKey(approximate)).toBe(houseAddressKey({ label: 'ДЕРЕВНЯ Благодатное улица Благодатновская дом 1' }));
    expect(houseAddressKey({ label: 'Сёлово, Новая улица, 1а' })).toBe(houseAddressKey({ label: 'с. Селово, ул. Новая, 1А' }));
  });
  it('keeps villages, road types and house suffixes separate', () => {
    for (const label of ['д. Поршур, ул. Благодатновская, 1', 'д. Благодатное, пер. Благодатновская, 1',
      'д. Благодатное, ул. Благодатновская, 1А', 'д. Благодатное, ул. Благодатновская, 1/2']) {
      expect(houseAddressKey({ label })).not.toBe(houseAddressKey(approximate));
    }
    expect(houseAddressKey({ label: 'д. Благодатное' })).toBeNull();
  });
  it('replaces the approximate entry once and preserves reliable house data', () => {
    expect(overlayRememberedAddresses([approximate], [point])).toEqual([point]);
    const reliable = { ...point, id: 'osm-house:known' };
    expect(overlayRememberedAddresses([reliable], [point])).toEqual([reliable]);
    expect(point.coordinatePrecision).toBe('precise');
    expect(point.details).not.toContain('точка приблизительная');
  });
  it('does not transfer a point to a distant namesake', () => {
    const distant = { ...approximate, coordinates: { latitude: 60, longitude: 50 } };
    expect(overlayRememberedAddresses([distant], [point])[0]).toEqual(distant);
  });
  it('keeps the selected village in a manually entered street-only address', () => {
    const anchor = grahovoAddressCatalog.find(a => a.label === 'д. Поршур, ул. Бабаева')!;
    const manual = buildManualAddress('Бабаева 999', anchor)!;
    expect(manual.label).toBe('д. Поршур, Бабаева 999');
    expect(houseAddressKey(manual)).toBe(houseAddressKey({ label: 'д. Поршур, ул. Бабаева, 999' }));
  });
});
