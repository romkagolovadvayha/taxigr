import type { RideStatus } from '@/domain/models';

export const rideStatusLabel: Record<RideStatus, string> = {
  draft: 'Черновик',
  searching: 'Ищем водителя',
  accepted: 'Водитель назначен',
  driver_arriving: 'Водитель едет',
  driver_waiting: 'Водитель ожидает',
  in_progress: 'В пути',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

export const driverTransitionLabel: Partial<Record<RideStatus, string>> = {
  accepted: 'Я приехал',
  driver_arriving: 'Я приехал',
  driver_waiting: 'Начать поездку',
  in_progress: 'Завершить поездку',
};

const transitions: Partial<Record<RideStatus, readonly RideStatus[]>> = {
  draft: ['searching', 'cancelled'],
  searching: ['accepted', 'driver_arriving', 'cancelled'],
  accepted: ['driver_arriving', 'driver_waiting', 'cancelled'],
  driver_arriving: ['driver_waiting', 'cancelled'],
  driver_waiting: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
};

export function canTransitionRide(from: RideStatus, to: RideStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function rideCancellationWarning(searching: boolean): string {
  return searching
    ? 'Подождите ещё немного. Возможно, водители заняты. За частые отмены заказы временно блокируются.'
    : 'Не отменяйте заказ по просьбе водителя. Несколько отмен могут привести к временной блокировке заказов.';
}

/** A lost HTTP response is successful only when the server confirms this step or a later one. */
export function driverTransitionConfirmed(requested: RideStatus, observed: RideStatus): boolean {
  const progression: readonly RideStatus[] = ['accepted', 'driver_arriving', 'driver_waiting', 'in_progress', 'completed'];
  const target = progression.indexOf(requested);
  return target >= 0 && progression.indexOf(observed) >= target;
}

export type DriverRouteTarget = 'pickup' | 'destination';

export function driverRouteTarget(status: RideStatus): DriverRouteTarget | null {
  if (status === 'accepted' || status === 'driver_arriving') return 'pickup';
  if (status === 'driver_waiting' || status === 'in_progress') return 'destination';
  return null;
}

export type DriverRoutePointState = 'completed' | 'current' | 'pending';

export function driverRoutePointState(
  status: RideStatus,
  pointIndex: number,
  nextDestinationIndex = 0,
): DriverRoutePointState {
  if (status === 'completed') return 'completed';

  const currentPointIndex =
    status === 'accepted' || status === 'driver_arriving'
      ? 0
      : status === 'driver_waiting' || status === 'in_progress'
        ? 1 + nextDestinationIndex
        : null;

  if (currentPointIndex === null) return 'pending';
  if (pointIndex < currentPointIndex) return 'completed';
  return pointIndex === currentPointIndex ? 'current' : 'pending';
}
