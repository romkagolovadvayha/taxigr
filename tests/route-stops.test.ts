import { describe, expect, it } from 'vitest';
import type { Address } from '../src/domain/models';
import { grahovoDirectoryAddresses } from '../src/data/grahovo-address-directory';
import { isDestinationAddressComplete, isPickupAddressComplete } from '../src/domain/address-precision';
import { confirmAddressPoint, normalizeRouteStops, replaceRouteStop, sameRouteStop } from '../src/domain/route-stops';

const a: Address = { id: 'a', label: 'с. Грахово, ул. Ачинцева, 5', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const b: Address = { id: 'b', label: 'с. Грахово, ул. Колпакова, 1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } };
const c: Address = { id: 'c', label: 'д. Благодатное, ул. Благодатновская, 53А', coordinates: { latitude: 55.9995786, longitude: 51.8684492 } };
describe('route stop identity and coordinate precision', () => {
  it('keeps the chosen destination when an editor opens before the destination list exists', () => {
    expect(replaceRouteStop([], 0, b)).toEqual([b]);
    expect(replaceRouteStop([b], 0, c)).toEqual([c]);
    expect(replaceRouteStop([b], 2, c)).toEqual([b, c]);
  });
  it('removes consecutive duplicate stops without deleting a return to the pickup', () => {
    expect(normalizeRouteStops(a!, [a!, b!, b!, c!, a!])).toEqual([b, c, a]);
  });
  it('does not merge different houses with identical approximate coordinates', () => {
    const first = grahovoDirectoryAddresses.find(x => x.label === 'с. Грахово, ул. Советская, 1')!;
    const second = grahovoDirectoryAddresses.find(x => x.label === 'с. Грахово, ул. Береговая, 32')!;
    expect(first.coordinates).toEqual(second.coordinates);
    expect(sameRouteStop(first, second)).toBe(false);
    expect(normalizeRouteStops(first, [second])).toEqual([second]);
    expect(isPickupAddressComplete(first)).toBe(false);
    expect(isDestinationAddressComplete(second)).toBe(false);
  });
  it('requires a map point for legacy GAR and manually anchored houses', () => {
    expect(isPickupAddressComplete({ id: 'gar:legacy', label: 'Грахово, Советская, 1' })).toBe(false);
    expect(isPickupAddressComplete({ id: 'manual:legacy', label: 'Грахово, Советская, 1' })).toBe(false);
    expect(isPickupAddressComplete({ label: 'Советская, 1', details: 'точка приблизительная' })).toBe(false);
  });
  it('accepts the selected map coordinates and retains locality information', () => {
    const address = grahovoDirectoryAddresses.find(x => x.kind === 'house')!;
    const confirmed = confirmAddressPoint(address, a!.coordinates);
    expect(confirmed.coordinates).toEqual(a!.coordinates);
    expect(confirmed.id.length).toBeLessThanOrEqual(80);
    expect(confirmed.details).toContain('Граховский район');
    expect(isPickupAddressComplete(confirmed)).toBe(true);
    expect(isDestinationAddressComplete(confirmed)).toBe(true);
  });
  it('still permits settlement centres as destinations, not as pickup addresses', () => {
    const address = grahovoDirectoryAddresses.find(x => x.kind === 'settlement')!;
    expect(isDestinationAddressComplete(address)).toBe(true);
    expect(isPickupAddressComplete(address)).toBe(false);
  });
  it('does not combine matching labels whose selected pickup points differ', () => {
    expect(sameRouteStop(a!, { ...a!, coordinates: c!.coordinates })).toBe(false);
  });
});
