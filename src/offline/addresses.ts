import { grahovoAddressCatalog } from '../data/grahovo-address-catalog';
import { distanceBetweenCoordinates } from '../domain/navigation';
import type { Address, Coordinates } from '../domain/models';

/** Only verified house coordinates can label a nearby GPS point. The point itself is never moved. */
export function nearestOfflineAddress(coordinates: Coordinates): Address | null {
  let closest: Address|null=null, distance=120;
  for (const address of grahovoAddressCatalog) {
    if (address.coordinatePrecision !== 'precise' || address.kind !== 'house') continue;
    const meters=distanceBetweenCoordinates(coordinates,address.coordinates);
    if (meters < distance) { distance=meters; closest=address; }
  }
  return closest;
}
