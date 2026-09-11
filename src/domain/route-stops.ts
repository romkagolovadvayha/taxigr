import type { Address, Coordinates } from './models';
import { distanceBetweenCoordinates } from './navigation';

/** A stale editor index must not silently discard a selected destination. */
export function replaceRouteStop(destinations: readonly Address[], index: number, address: Address): Address[] {
  if (!Number.isInteger(index) || index < 0) return [...destinations];
  if (index >= destinations.length) return [...destinations, address].slice(0, 5);
  return destinations.map((item, itemIndex) => itemIndex === index ? address : item);
}

/** Address identity matters: different houses can share an approximate centre. */
export function sameRouteStop(left: Address, right: Address): boolean {
  const label = (value: string) => value.trim().toLocaleLowerCase('ru').replace(/\s+/gu, ' ');
  return (Boolean(left.placeId && left.placeId === right.placeId) ||
    label(left.label) === label(right.label)) &&
    distanceBetweenCoordinates(left.coordinates, right.coordinates) < 1;
}

export function normalizeRouteStops(pickup: Address | null, destinations: readonly Address[]): Address[] {
  const result: Address[] = [];
  for (const destination of destinations) {
    const previous = result[result.length - 1] ?? pickup;
    if (!previous || !sameRouteStop(previous, destination)) result.push(destination);
  }
  return result;
}

export function confirmAddressPoint(address: Address, coordinates: Coordinates): Address {
  return {
    ...address,
    id: `map:${coordinates.latitude.toFixed(7)},${coordinates.longitude.toFixed(7)}`,
    coordinatePrecision: 'precise',
    details: `${(address.details ?? '').split('·')[0]!.trim().slice(0, 210)} · точка выбрана на карте`,
    coordinates,
  };
}
