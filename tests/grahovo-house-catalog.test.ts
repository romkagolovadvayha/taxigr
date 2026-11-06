import { describe, expect, it } from 'vitest';
import { grahovoAddressCatalog, grahovoAddressSuggestions, grahovoDirectoryHousesById, grahovoHouseSnapshot, grahovoSettlement } from '../src/data/grahovo-address-catalog';
import { grahovoDirectoryAddresses } from '../src/data/grahovo-address-directory';
import { hasApproximateCoordinates, isDestinationAddressBookable, isPickupAddressBookable, isPickupAddressComplete } from '../src/domain/address-precision';
import { filterRequestedHouse, rankAddressSearchResults } from '../src/domain/address-search';

describe('district house coordinates', () => {
  it('uses official local streets for suggestions and a settlement for manual map positioning', () => {
    expect(grahovoAddressSuggestions).toHaveLength(5);
    expect(grahovoAddressSuggestions.every(address => address.id.startsWith('gar:') &&
      address.kind === 'street' && grahovoAddressCatalog.includes(address))).toBe(true);
    expect(grahovoSettlement).toMatchObject({ kind: 'settlement', label: 'с. Грахово', coordinatePrecision: 'approximate' });
  });
  it('keeps every GAR object and adds mapped addresses absent from that snapshot', () => {
    const replaced = new Set(grahovoHouseSnapshot.points.flatMap(p => 'garId' in p ? [p.garId] : []));
    const ids = new Set(grahovoAddressCatalog.map(a => a.id));
    expect(ids.size).toBe(grahovoAddressCatalog.length);
    expect(grahovoDirectoryAddresses.every(a => ids.has(a.id) || replaced.has(a.id))).toBe(true);
    expect(grahovoAddressCatalog.length).toBeGreaterThan(grahovoDirectoryAddresses.length);
  });
  it('uses mapped building points instead of a shared village anchor', () => {
    const precise = grahovoAddressCatalog.filter(a => a.coordinatePrecision === 'precise');
    expect(precise.length).toBeGreaterThanOrEqual(550);
    expect(precise.every(isPickupAddressComplete)).toBe(true);
    expect(precise.every(a => Number.isFinite(a.coordinates.latitude) && a.coordinates.latitude > 55.88 &&
      a.coordinates.latitude < 56.26 && a.coordinates.longitude > 51.53 && a.coordinates.longitude < 52.27)).toBe(true);
    const a = grahovoAddressCatalog.find(a => a.label === 'с. Грахово, ул. Колпакова, 8')!;
    const b = grahovoAddressCatalog.find(a => a.label === 'с. Грахово, ул. Колпакова, 22')!;
    expect(isPickupAddressComplete(a)).toBe(true);
    expect(a.coordinates).not.toEqual(b.coordinates);
  });
  it('retains the user example without inventing a location for Благодатновская, 1', () => {
    const address = grahovoAddressCatalog.find(a => a.label === 'д. Благодатное, ул. Благодатновская, 1')!;
    expect(address.houseNumber).toBe('1');
    expect(hasApproximateCoordinates(address)).toBe(true);
    expect(isPickupAddressComplete(address)).toBe(false);
  });
  it('provides a bookable point for every official house and uses nearby houses for Молодежная, 4', () => {
    const houses = grahovoAddressCatalog.filter(a => a.kind === 'house');
    expect(grahovoDirectoryAddresses.filter(a => a.kind === 'house').every(a => grahovoDirectoryHousesById.has(a.id))).toBe(true);
    expect(houses.every(a => isPickupAddressBookable(a) && isDestinationAddressBookable(a) &&
      a.coordinates.latitude > 55.88 && a.coordinates.latitude < 56.26 &&
      a.coordinates.longitude > 51.53 && a.coordinates.longitude < 52.27)).toBe(true);
    const example = grahovoAddressCatalog.find(a => a.label === 'с. Грахово, ул. Молодежная, 4');
    expect(example).toMatchObject({ coordinatePrecision: 'approximate', details: expect.stringContaining('по соседним домам') });
    expect(example?.coordinates.latitude).toBeCloseTo(56.0412, 4);
    expect(example?.coordinates.longitude).toBeCloseTo(51.9671, 4);
    const former = grahovoAddressCatalog.find(a => a.label === 'д. Поршур, ул. Бабаева, 6');
    expect(former).toMatchObject({ coordinatePrecision: 'approximate', details: expect.stringContaining('архивный адрес') });
  });
  it('shows house 1 rather than 10 or 19 while the remote search is pending', () => {
    const query = 'д. Благодатное, ул. Благодатновская, 1';
    const results = filterRequestedHouse(rankAddressSearchResults(grahovoAddressCatalog, query), query);
    expect(results.map(a => a.houseNumber)).toEqual(['1']);
  });
});
