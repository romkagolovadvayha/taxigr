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
  searching?: boolean;
  destinations?: Address[] | null;
  destination?: Address | null;
  routeCoordinates?: Coordinates[] | null;
  pickupEtaMinutes?: number | null;
  destinationArrivalLabel?: string | null;
  driver?: Coordinates | null;
  driverHeading?: number | null;
  driverColorHex?: string | null;
  passenger?: Coordinates | null;
  followDriver?: boolean;
  followZoom?: number;
  /** Explicitly resume following after the user pans the map. */
  followRequestId?: number;
  trimCompletedRoute?: boolean;
  navigationMode?: boolean;
  routeTarget?: DriverRouteTarget | null;
  viewportInsets?: MapViewportInsets;
  /** Center to show before an address or route is selected. */
  defaultCenter?: Coordinates;
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
  selectionCenter?: Coordinates;
  onCoordinateSelect?: (coordinates: Coordinates) => void;
  onSelectionInteraction?: () => void;
  onRoutePointEdit?: (destinationIndex: number | null) => void;
};
