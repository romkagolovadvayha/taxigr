import type { Address } from '../domain/models';
import { distanceBetweenCoordinates } from '../domain/navigation';
import { grahovoDirectoryAddresses } from './grahovo-address-directory';
import snapshot from './grahovo-house-points.json';
import previousSnapshot from './grahovo-previous-house-addresses.json';
import streetSnapshot from './grahovo-street-points.json';

const points: Address[] = snapshot.points.map(point => ({
  id: point.id, label: point.label, houseNumber: point.houseNumber,
  kind: 'house', coordinatePrecision: 'precise', coordinates: point.coordinates,
  details: 'Граховский район, Удмуртская Республика · точка дома · OpenStreetMap',
}));
const replacementByGarId = new Map(snapshot.points.flatMap((point, index) =>
  'garId' in point ? [[point.garId, points[index]!] as const] : []));
const streetPoints = new Map(Object.entries(streetSnapshot.points).map(([label, [latitude, longitude]]) =>
  [label, { latitude: latitude!, longitude: longitude! }] as const));
const directoryById = new Map(grahovoDirectoryAddresses.map(address => [address.id, address]));
const localityPoints = new Map(grahovoDirectoryAddresses.filter(address => address.kind === 'settlement').map(address =>
  [address.label.replace(/^\S+\s+/u, ''), address.coordinates] as const));
const numberedPoints = new Map<string, { number: number; coordinates: Address['coordinates'] }[]>();

for (const point of points) {
  if (!/^\d+$/u.test(point.houseNumber ?? '')) continue;
  const label = point.label.slice(0, point.label.lastIndexOf(', '));
  const neighbors = numberedPoints.get(label) ?? [];
  neighbors.push({ number: Number(point.houseNumber), coordinates: point.coordinates });
  numberedPoints.set(label, neighbors);
}

function interpolateHouse(address: Address, parent: Address): Address['coordinates'] | undefined {
  const number = Number(address.houseNumber?.match(/^\d+/u)?.[0]);
  if (!Number.isFinite(number)) return undefined;
  const neighbors = numberedPoints.get(parent.label) ?? [];
  const sameSide = neighbors.filter(point => point.number % 2 === number % 2);
  for (const candidates of [sameSide, neighbors]) {
    const lower = candidates.reduce<typeof candidates[number] | undefined>((best, point) =>
      point.number <= number && (!best || point.number > best.number) ? point : best, undefined);
    const upper = candidates.reduce<typeof candidates[number] | undefined>((best, point) =>
      point.number >= number && (!best || point.number < best.number) ? point : best, undefined);
    if (!lower || !upper || upper.number - lower.number > 30 ||
      distanceBetweenCoordinates(lower.coordinates, upper.coordinates) > 350) continue;
    const ratio = upper.number === lower.number ? 0 : (number - lower.number) / (upper.number - lower.number);
    return {
      latitude: lower.coordinates.latitude + (upper.coordinates.latitude - lower.coordinates.latitude) * ratio,
      longitude: lower.coordinates.longitude + (upper.coordinates.longitude - lower.coordinates.longitude) * ratio,
    };
  }
  return undefined;
}

export const grahovoDirectoryHousesById = new Map<string, Address>();
function parentForHouse(id: string): Address | undefined {
  return directoryById.get(id.slice(0, id.lastIndexOf(':')));
}

function catalogueAddress(address: Address): Address {
  if (address.kind !== 'house') {
    const coordinates = streetPoints.get(address.label);
    return coordinates ? { ...address, coordinates } : address;
  }
  const parent = parentForHouse(address.id);
  const nearby = parent && interpolateHouse(address, parent);
  const street = parent && streetPoints.get(parent.label);
  const territoryLocality = parent?.label.match(/\(([^()]+)\)$/u)?.[1];
  const territoryPoint = territoryLocality ? localityPoints.get(territoryLocality) : undefined;
  const canonical = replacementByGarId.get(address.id) ?? {
    ...address,
    coordinates: nearby ?? street ?? territoryPoint ?? address.coordinates,
    details: `${address.details} (${nearby ? 'по соседним домам' : street ? 'по улице'
      : address.coordinates.latitude === 56.026 && address.coordinates.longitude === 51.95 && !territoryPoint
        ? 'ориентир в районе' : 'по населённому пункту'})`,
  };
  grahovoDirectoryHousesById.set(address.id, canonical);
  return canonical;
}

export const grahovoAddressCatalog: Address[] = [
  ...grahovoDirectoryAddresses.map(catalogueAddress),
  ...snapshot.points.flatMap((point, index) => 'garId' in point ? [] : [points[index]!]),
  ...previousSnapshot.houses.flatMap(([id, label, houseNumber]) => {
    if (!id || !label || !houseNumber || grahovoDirectoryHousesById.has(id)) return [];
    const parent = parentForHouse(id);
    return parent ? [catalogueAddress({
      id, label, houseNumber, kind: 'house', coordinatePrecision: 'approximate',
      details: 'Граховский район, Удмуртская Республика · архивный адрес из ГАР, точка приблизительная',
      coordinates: parent.coordinates,
    })] : [];
  }),
];

export const grahovoHouseSnapshot = snapshot;
export const grahovoPreviousHouseSnapshot = previousSnapshot;

export const grahovoAddressSuggestions = grahovoAddressCatalog
  .filter(address => address.kind === 'street' && address.label.startsWith('с. Грахово,'))
  .slice(0, 5);

export const grahovoSettlement = grahovoAddressCatalog.find(
  address => address.kind === 'settlement' && address.label === 'с. Грахово',
) ?? null;
