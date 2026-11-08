import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import { defaultFirstOrderPromotionSettings, promotionMessageMaxLength, tariffPromotionMessageMaxLength, type FirstOrderPromotionSettings } from '../src/domain/first-order-discount';
import { db, withTransaction } from './db';

export const promotionSettingsSchema = z.object({
  discountPercent: z.number().int().min(0).max(100),
  messageTemplate: z.string().max(promotionMessageMaxLength),
  tariffMessageTemplate: z.string().max(tariffPromotionMessageMaxLength).optional(),
}).strict();
export type PromotionSettingsUpdate = z.infer<typeof promotionSettingsSchema>;

type PromotionRow = RowDataPacket & { discount_percent: number; message_template: string; tariff_message_template: string };

export async function readPromotionSettings(connection?: PoolConnection): Promise<FirstOrderPromotionSettings> {
  const [rows] = await (connection ?? db).query<PromotionRow[]>(
    `SELECT discount_percent, message_template, tariff_message_template FROM first_order_promotion_settings WHERE id = 1${connection ? ' LOCK IN SHARE MODE' : ''}`,
  );
  if (!rows[0]) throw new Error('Настройки скидки отсутствуют. Выполните миграции базы данных.');
  const settings = promotionSettingsSchema.parse({ discountPercent: rows[0].discount_percent, messageTemplate: rows[0].message_template, tariffMessageTemplate: rows[0].tariff_message_template });
  return { ...settings, tariffMessageTemplate: settings.tariffMessageTemplate ?? defaultFirstOrderPromotionSettings.tariffMessageTemplate };
}

export async function savePromotionSettings(input: PromotionSettingsUpdate, actorId: string, ip?: string) {
  return withTransaction(async connection => {
    const [rows] = await connection.query<PromotionRow[]>(
      'SELECT discount_percent, message_template, tariff_message_template FROM first_order_promotion_settings WHERE id = 1 FOR UPDATE',
    );
    if (!rows[0]) throw new Error('Настройки скидки отсутствуют. Выполните миграции базы данных.');
    const before = { discountPercent: rows[0].discount_percent, messageTemplate: rows[0].message_template, tariffMessageTemplate: rows[0].tariff_message_template };
    // Older administrator clients omit the tariff caption; preserve its saved value, including an empty string.
    const saved = { ...input, tariffMessageTemplate: input.tariffMessageTemplate ?? before.tariffMessageTemplate };
    await connection.execute(
      'UPDATE first_order_promotion_settings SET discount_percent = ?, message_template = ?, tariff_message_template = ?, updated_by = ? WHERE id = 1',
      [saved.discountPercent, saved.messageTemplate, saved.tariffMessageTemplate, actorId],
    );
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
       VALUES (?, 'promotion_settings.update', 'first_order_promotion_settings', '1', ?, ?, ?)`,
      [actorId, JSON.stringify(before), JSON.stringify(saved), ip ?? null],
    );
    return saved;
  });
}
