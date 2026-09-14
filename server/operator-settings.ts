import 'dotenv/config';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import type { OperatorDetails } from '../src/domain/operator-details';
import { defaultOperatorDetails } from '../src/legal/operator';
import { db, withTransaction } from './db';

type OperatorRow = RowDataPacket & { settings_json: OperatorDetails | string | null };

export async function readOperatorSettings(connection?: PoolConnection): Promise<OperatorDetails> {
  const [rows] = await (connection ?? db).query<OperatorRow[]>(
    `SELECT settings_json FROM operator_settings WHERE id = 1${connection ? ' FOR UPDATE' : ''}`,
  );
  const row = rows[0];
  if (!row) throw new Error('Реквизиты оператора отсутствуют. Выполните миграции базы данных.');
  if (row.settings_json === null) return { ...defaultOperatorDetails };
  return typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) as OperatorDetails : row.settings_json;
}

export async function saveOperatorSettings(input: OperatorDetails, actorId: string, ip?: string) {
  return withTransaction(async (connection) => {
    const before = await readOperatorSettings(connection);
    await connection.execute(
      'UPDATE operator_settings SET settings_json = ?, updated_by = ? WHERE id = 1',
      [JSON.stringify(input), actorId],
    );
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
       VALUES (?, 'operator_settings.update', 'operator_settings', '1', ?, ?, ?)`,
      [actorId, JSON.stringify(before), JSON.stringify(input), ip ?? null],
    );
    return input;
  });
}
