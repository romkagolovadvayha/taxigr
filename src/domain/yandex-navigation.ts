import type { Coordinates } from '@/domain/models';

function assertRouteCoordinates({ latitude, longitude }: Coordinates): void {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Некорректные координаты точки маршрута.');
  }
}

export function buildYandexNavigatorRouteUrl(target: Coordinates): string {
  assertRouteCoordinates(target);

  return (
    'yandexnavi://build_route_on_map' +
    `?lat_to=${target.latitude}&lon_to=${target.longitude}`
  );
}

export function buildYandexMapsRouteUrl(target: Coordinates): string {
  assertRouteCoordinates(target);

  return (
    'https://yandex.ru/maps/' +
    `?rtext=~${target.latitude}%2C${target.longitude}&rtt=auto`
  );
}
