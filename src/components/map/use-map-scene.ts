import { useMemo } from 'react';
import { taxiMapScene } from './map-scene';
import type { TaxiMapProps } from './types';

export function useMapScene(props: TaxiMapProps) {
  const { pickup, destinations, destination, routeCoordinates, trimCompletedRoute, driver, routeTarget,
    pickupEtaMinutes, destinationArrivalLabel } = props;
  // Tracking a marker does not change a route unless its travelled part is
  // actually being trimmed. Key that case by coordinates, not object identity.
  const latitude = trimCompletedRoute ? driver?.latitude : undefined;
  const longitude = trimCompletedRoute ? driver?.longitude : undefined;
  return useMemo(() => taxiMapScene({ pickup, destinations, destination, routeCoordinates,
    trimCompletedRoute, driver: latitude != null && longitude != null ? { latitude, longitude } : null,
    routeTarget, pickupEtaMinutes, destinationArrivalLabel }),
  [pickup, destinations, destination, routeCoordinates, trimCompletedRoute, latitude, longitude, routeTarget, pickupEtaMinutes, destinationArrivalLabel]);
}
