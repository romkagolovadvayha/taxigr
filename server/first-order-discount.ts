import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { isLocalPromotionScope } from '../src/domain/first-order-discount';
import type { PricingScope } from '../src/domain/pricing';
import { config } from './config';
import { db } from './db';
import { deviceFingerprint } from './phone-verification';

/** Call again under the passenger/phone identity locks when creating an order. */
export async function firstLocalOrderEligible(
  passengerId: string,
  scope: PricingScope,
  connection: Pool | PoolConnection = db,
): Promise<boolean> {
  if (!isLocalPromotionScope(scope)) return false;
  const [users] = await connection.query<(RowDataPacket & { phone: string | null; phone_verified_at: unknown })[]>(
    'SELECT phone, phone_verified_at FROM users WHERE id = ? AND deleted_at IS NULL', [passengerId],
  );
  const user = users[0];
  if (!user?.phone || !user.phone_verified_at) return false;
  const phoneFingerprint = deviceFingerprint(`phone:${user.phone}`, config.JWT_SECRET);
  const [orders] = await connection.query<RowDataPacket[]>(
    `SELECT o.id FROM orders o JOIN users u ON u.id = o.passenger_id
     WHERE o.status = 'completed' AND o.pricing_scope IN ('grahovo', 'district')
       AND (o.passenger_id = ? OR u.phone = ? OR o.promotion_phone_fingerprint = ?)
     LIMIT 1`,
    [passengerId, user.phone, phoneFingerprint],
  );
  // Cancelled orders do not spend the offer; intercity trips do not participate.
  return orders.length === 0;
}
