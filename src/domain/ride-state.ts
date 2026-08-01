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
  accepted: 'Выехать к пассажиру',
  driver_arriving: 'Я на месте',
  driver_waiting: 'Начать поездку',
  in_progress: 'Завершить поездку',
};

const transitions: Partial<Record<RideStatus, readonly RideStatus[]>> = {
  draft: ['searching', 'cancelled'],
  searching: ['accepted', 'cancelled'],
  accepted: ['driver_arriving', 'cancelled'],
  driver_arriving: ['driver_waiting', 'cancelled'],
  driver_waiting: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
};

export function canTransitionRide(from: RideStatus, to: RideStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export type DriverRouteTarget = 'pickup' | 'destination';

export function driverRouteTarget(status: RideStatus): DriverRouteTarget | null {
  if (status === 'accepted' || status === 'driver_arriving') return 'pickup';
  if (status === 'driver_waiting' || status === 'in_progress') return 'destination';
  return null;
}
