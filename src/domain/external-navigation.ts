import { hasApproximateCoordinates } from './address-precision';
import type { Address, RideOrder } from './models';
import { driverRouteTarget } from './ride-state';

type NavigationRide = Pick<RideOrder, 'status' | 'pickup' | 'destination' | 'destinations' | 'nextDestinationIndex'>;

/** Navigate to pickup before arrival, then to the next uncompleted stop. */
export function driverNavigationAddress(ride: NavigationRide | null): Address | null {
  if (!ride) return null;
  const target = driverRouteTarget(ride.status);
  if (!target) return null;
  return target === 'pickup' ? ride.pickup : ride.destinations?.[ride.nextDestinationIndex ?? 0] ?? ride.destination;
}

export function yandexNavigationUrls(address: Address): { navigator: string; maps: string; mode: 'route' | 'search' } {
  const { latitude, longitude } = address.coordinates;
  const precise = !hasApproximateCoordinates(address) &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0);
  if (precise) {
    // Omit the origin: Navigator obtains its own current GPS position, even
    // when our app has no fix yet. Route coordinates use latitude,longitude.
    const params = new URLSearchParams({ lat_to: String(latitude), lon_to: String(longitude) });
    const web = new URLSearchParams({ rtext: `~${latitude},${longitude}`, rtt: 'auto' });
    return { navigator: `yandexnavi://build_route_on_map?${params}`, maps: `https://yandex.ru/maps/?${web}`, mode: 'route' };
  }
  const label = address.label.trim();
  if (!label) throw new Error('Адрес для маршрута не указан');
  // Manual bot orders can contain (0,0), and GAR anchors can be approximate.
  // Search their original address instead of sending the driver to a false point.
  const query = new URLSearchParams({ text: label });
  return { navigator: `yandexnavi://map_search?${query}`, maps: `https://yandex.ru/maps/?${query}`, mode: 'search' };
}

/** HTTPS entry for messengers that reject non-HTTP button URLs. No login or order token. */
export function navigationPagePath(address: Address): string {
  const params = new URLSearchParams({ address: address.label.slice(0, 300) });
  if (yandexNavigationUrls(address).mode === 'route') {
    params.set('lat', String(address.coordinates.latitude));
    params.set('lon', String(address.coordinates.longitude));
  }
  return `/navigate?${params}`;
}

export function parseNavigationPage(params: Record<string, string | string[] | undefined>): Address | null {
  if (typeof params.address !== 'string' || !params.address.trim() || params.address.length > 300) return null;
  const address: Address = { id: 'manual:navigation', label: params.address.trim(), coordinatePrecision: 'approximate', coordinates: { latitude: 0, longitude: 0 } };
  if (params.lat === undefined && params.lon === undefined) return address;
  if (typeof params.lat !== 'string' || !params.lat.trim() || typeof params.lon !== 'string' || !params.lon.trim()) return null;
  address.id = 'navigation-point';
  address.coordinatePrecision = 'precise';
  address.coordinates = { latitude: Number(params.lat), longitude: Number(params.lon) };
  return yandexNavigationUrls(address).mode === 'route' ? address : null;
}
