import type { Address, Coordinates } from '../domain/models';
import { validMapCoordinate } from '../domain/map-coordinates';
import { searchMapAddresses, type MapAddressOptions } from './map-addresses';
import { nearestOfflineAddress } from '../offline/addresses';

/** A geocoder supplies the label; pickup stays at the passenger's GPS position. */
export function pickupAddressAtCoordinates(
  address: Pick<Address, 'label' | 'details' | 'houseNumber'>,
  coordinates: Coordinates,
): Address | null {
  const label = address.label?.trim();
  if (!label || /^мо[её] местоположение$/iu.test(label) || !validMapCoordinate(coordinates)) return null;
  return {
    id: 'location:' + coordinates.latitude.toFixed(7) + ',' + coordinates.longitude.toFixed(7),
    label, houseNumber: address.houseNumber,
    details: [address.details, 'Точка определена по геопозиции устройства'].filter(Boolean).join(' · '),
    kind: 'place', coordinatePrecision: 'precise', coordinates,
  };
}

export async function resolvePickupAddress(coordinates: Coordinates, options: MapAddressOptions): Promise<Address | null> {
  if (!options.token || options.signal?.aborted) return null;
  const mapPoint = pickupAddressAtCoordinates({ label: 'Точка на карте' }, coordinates);
  if (!mapPoint) return null;
  const local = nearestOfflineAddress(coordinates);
  if (local) return pickupAddressAtCoordinates(local,coordinates);
  try {
    const addresses = await searchMapAddresses(coordinates.longitude + ',' + coordinates.latitude, options);
    if (options.signal?.aborted) return null;
    for (const address of addresses) {
      const pickup = pickupAddressAtCoordinates(address, coordinates);
      if (pickup) return pickup;
    }
  } catch {
    // A missing street or a failed address lookup does not invalidate the GPS point.
  }
  return options.signal?.aborted ? null : mapPoint;
}
