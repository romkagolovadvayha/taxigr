import type { Address } from '../domain/models';
import { grahovoDirectoryAddresses } from './grahovo-address-directory';
import snapshot from './grahovo-house-points.json';

const points: Address[] = snapshot.points.map(point => ({
  id: point.id, label: point.label, houseNumber: point.houseNumber,
  kind: 'house', coordinatePrecision: 'precise', coordinates: point.coordinates,
  details: 'Граховский район, Удмуртская Республика · точка дома · OpenStreetMap',
}));
const replacementByGarId = new Map(snapshot.points.flatMap((point, index) =>
  'garId' in point ? [[point.garId, points[index]!] as const] : []));

// Keep the original GAR snapshot intact, including legacy approximate identifiers.
// A mapped building receives an OSM identifier, never a falsely precise GAR anchor.
export const grahovoAddressCatalog: Address[] = [
  ...grahovoDirectoryAddresses.map(address => replacementByGarId.get(address.id) ?? address),
  ...snapshot.points.flatMap((point, index) => 'garId' in point ? [] : [points[index]!]),
];

export const grahovoHouseSnapshot = snapshot;

export const grahovoAddressSuggestions = grahovoAddressCatalog
  .filter(address => address.kind === 'street' && address.label.startsWith('с. Грахово,'))
  .slice(0, 5);

export const grahovoSettlement = grahovoAddressCatalog.find(
  address => address.kind === 'settlement' && address.label === 'с. Грахово',
) ?? null;
