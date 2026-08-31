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

function routeTargets(target: Coordinates | readonly Coordinates[]): readonly Coordinates[] {
  const targets = Array.isArray(target) ? target : [target];
  if (!targets.length) throw new Error('Добавьте хотя бы одну точку маршрута.');
  targets.forEach(assertRouteCoordinates);
  return targets;
}

export function buildYandexNavigatorRouteUrl(
  target: Coordinates | readonly Coordinates[],
  origin?: Coordinates,
): string {
  const targets = routeTargets(target);
  if (origin) assertRouteCoordinates(origin);
  const finalTarget = targets.at(-1)!;
  const parameters = [
    ...(origin
      ? [`lat_from=${origin.latitude}`, `lon_from=${origin.longitude}`]
      : []),
    `lat_to=${finalTarget.latitude}`,
    `lon_to=${finalTarget.longitude}`,
    ...targets.slice(0, -1).flatMap((point, index) => [
      `lat_via_${index}=${point.latitude}`,
      `lon_via_${index}=${point.longitude}`,
    ]),
  ];

  return `yandexnavi://build_route_on_map?${parameters.join('&')}`;
}

export function buildYandexMapsRouteUrl(
  target: Coordinates | readonly Coordinates[],
  origin?: Coordinates,
): string {
  const targets = routeTargets(target);
  if (origin) assertRouteCoordinates(origin);
  const targetPoints = targets
    .map((point) => `${point.latitude}%2C${point.longitude}`)
    .join('~');
  const routeText = origin
    ? `${origin.latitude}%2C${origin.longitude}~${targetPoints}`
    : `~${targetPoints}`;

  return `https://yandex.ru/maps/?rtext=${routeText}&rtt=auto`;
}
