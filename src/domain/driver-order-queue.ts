import type { RideOrder } from '@/domain/models';

export const maximumAssignedDriverOrders = 2;

const assignedStatuses = new Set<RideOrder['status']>([
  'accepted',
  'driver_arriving',
  'driver_waiting',
  'in_progress',
]);

export function isAssignedDriverOrder(order: RideOrder): boolean {
  return Boolean(order.driverId) && assignedStatuses.has(order.status);
}

export function isQueuedDriverOrder(order: RideOrder): boolean {
  return isAssignedDriverOrder(order) && order.driverQueuePosition === 2;
}

export function selectDriverOrderQueue(
  orders: RideOrder[],
  offers: RideOrder[],
): {
  current: RideOrder | null;
  next: RideOrder | null;
  offer: RideOrder | null;
} {
  const assigned = orders.filter(isAssignedDriverOrder);
  const current = assigned.find((order) => order.driverQueuePosition !== 2) ?? null;
  const next = assigned.find(isQueuedDriverOrder) ?? null;
  const offer = assigned.length < maximumAssignedDriverOrders
    ? offers.find((order) => order.status === 'searching' && !order.driverId) ?? null
    : null;

  return { current, next, offer };
}
