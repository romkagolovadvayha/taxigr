import type { Address, Coordinates } from '@/domain/models';
import type { DriverRouteTarget } from '@/domain/ride-state';

export type MapViewportInsets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type TaxiMapProps = {
  pickup?: Address | null;
  destinations?: Address[] | null;
  destination?: Address | null;
  routeCoordinates?: Coordinates[] | null;
  pickupEtaMinutes?: number | null;
  destinationArrivalLabel?: string | null;
  driver?: Coordinates | null;
  driverHeading?: number | null;
  passenger?: Coordinates | null;
  followDriver?: boolean;
  followZoom?: number;
  trimCompletedRoute?: boolean;
  navigationMode?: boolean;
  routeTarget?: DriverRouteTarget | null;
  viewportInsets?: MapViewportInsets;
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
};
