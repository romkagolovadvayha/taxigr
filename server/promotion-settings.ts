import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import { promotionMessageMaxLength, type FirstOrderPromotionSettings } from '../src/domain/first-order-discount';
import { db, withTransaction } from './db';

export const promotionSettingsSchema = z.object({
  discountPercent: z.number().int().min(0).max(100),
  messageTemplate: z.string().max(promotionMessageMaxLength),
}).strict();

export async function readPromotionSettings(connection?: PoolConnection): Promise<FirstOrderPromotionSettings> {
  const [rows] = await (connection ?? db).query<(RowDataPacket & { discount_percent: number; message_template: string })[]>(
    `SELECT discount_percent, message_template FROM first_order_promotion_settings WHERE id = 1${connection ? ' LOCK IN SHARE MODE' : ''}`,
  );
  if (!rows[0]) throw new Error('Настройки скидки отсутствуют. Выполните миграции базы данных.');
  return promotionSettingsSchema.parse({ discountPercent: rows[0].discount_percent, messageTemplate: rows[0].message_template });
}

export async function savePromotionSettings(input: FirstOrderPromotionSettings, actorId: string, ip?: string) {
  return withTransaction(async connection => {
    const [rows] = await connection.query<(RowDataPacket & { discount_percent: number; message_template: string })[]>(
      'SELECT discount_percent, message_template FROM first_order_promotion_settings WHERE id = 1 FOR UPDATE',
    );
    if (!rows[0]) throw new Error('Настройки скидки отсутствуют. Выполните миграции базы данных.');
    const before = { discountPercent: rows[0].discount_percent, messageTemplate: rows[0].message_template };
    await connection.execute(
      'UPDATE first_order_promotion_settings SET discount_percent = ?, message_template = ?, updated_by = ? WHERE id = 1',
      [input.discountPercent, input.messageTemplate, actorId],
    );
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
       VALUES (?, 'promotion_settings.update', 'first_order_promotion_settings', '1', ?, ?, ?)`,
      [actorId, JSON.stringify(before), JSON.stringify(input), ip ?? null],
    );
    return input;
  });
}
