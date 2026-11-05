import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { maximumAssignedDriverOrders } from '../src/domain/driver-order-queue';
import { db } from './db';

export type DriverAudience = 'all' | 'priority' | 'nonpriority' | 'available';
export type DriverOrderDispatch = {
  eligibleDriverIds: string[];
  notificationDriverIds: string[];
};

/** A missing child-seat flag limits acceptance, not awareness of a new order. */
export async function getDriverOrderDispatch(
  orderId: string,
  audience: DriverAudience,
  connection?: Pick<PoolConnection, 'query'>,
): Promise<DriverOrderDispatch> {
  const executor = connection ?? db;
  const priorityClause = audience === 'priority'
    ? `AND EXISTS (SELECT 1 FROM driver_priority_assignments priority
         WHERE priority.driver_id = d.id AND priority.scope = o.pricing_scope)`
    : audience === 'nonpriority'
      ? `AND NOT EXISTS (SELECT 1 FROM driver_priority_assignments priority
           WHERE priority.driver_id = d.id AND priority.scope = o.pricing_scope)`
      : audience === 'available'
        ? `AND (o.priority_release_at IS NULL OR o.priority_release_at <= UTC_TIMESTAMP(3)
             OR EXISTS (SELECT 1 FROM driver_priority_assignments priority
               WHERE priority.driver_id = d.id AND priority.scope = o.pricing_scope))`
        : '';
  const [rows] = await executor.query<(RowDataPacket & { id: string; can_accept: number })[]>(
    `SELECT d.id, (o.tariff <> 'child' OR d.has_child_seat = TRUE) AS can_accept
     FROM orders o JOIN drivers d ON d.status IN ('online', 'busy')
     WHERE o.id = ?
       AND (SELECT COUNT(*) FROM orders active_order
         WHERE active_order.driver_id = d.id
           AND active_order.status IN ('accepted','driver_arriving','driver_waiting','in_progress')) < ?
       AND NOT EXISTS (SELECT 1 FROM driver_order_rejections rejected
         WHERE rejected.order_id = o.id AND rejected.driver_id = d.id)
       ${priorityClause}`,
    [orderId, maximumAssignedDriverOrders],
  );
  return {
    eligibleDriverIds: rows.filter(row => Boolean(row.can_accept)).map(row => String(row.id)),
    notificationDriverIds: rows.map(row => String(row.id)),
  };
}
