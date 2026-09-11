import { useMemo } from 'react';
import { taxiMapScene } from './map-scene';
import type { TaxiMapProps } from './types';

export function useMapScene(props: TaxiMapProps) {
  const { pickup, destinations, destination, routeCoordinates, trimCompletedRoute, driver, routeTarget,
    pickupEtaMinutes, destinationArrivalLabel } = props;
  return useMemo(() => taxiMapScene({ pickup, destinations, destination, routeCoordinates,
    trimCompletedRoute, driver, routeTarget, pickupEtaMinutes, destinationArrivalLabel }),
  [pickup, destinations, destination, routeCoordinates, trimCompletedRoute, driver, routeTarget, pickupEtaMinutes, destinationArrivalLabel]);
}
