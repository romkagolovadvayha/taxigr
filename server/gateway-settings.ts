import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import type { GatewaySettings } from '../src/domain/gateway';
import { db, withTransaction } from './db';
import {
  decryptGatewaySecret, encryptGatewaySecret, mergeGatewaySettings, presentGatewaySettings,
  type GatewayConfiguration, type GatewayUpdate,
} from './gateway';

type SettingsRow = RowDataPacket & {
  settings_json: GatewaySettings | string;
  proxy_password_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  revision: number;
};

export async function readGatewaySettings(connection?: PoolConnection): Promise<GatewayConfiguration> {
  const [rows] = await (connection ?? db).query<SettingsRow[]>(
    `SELECT settings_json, proxy_password_encrypted, webhook_secret_encrypted, revision
     FROM gateway_settings WHERE id = 1${connection ? ' FOR UPDATE' : ''}`,
  );
  const row = rows[0];
  if (!row) throw new Error('Настройки шлюза отсутствуют. Выполните миграции базы данных.');
  return {
    ...(typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) as GatewaySettings : row.settings_json),
    revision: Number(row.revision),
    proxyPassword: decryptGatewaySecret(row.proxy_password_encrypted),
    webhookSecret: decryptGatewaySecret(row.webhook_secret_encrypted),
  };
}

export async function saveGatewaySettings(input: GatewayUpdate, actorId: string | null, ip?: string) {
  return withTransaction(async (connection) => {
    const before = await readGatewaySettings(connection);
    if (input.revision !== before.revision) {
      throw Object.assign(new Error('Настройки уже изменены. Обновите страницу и повторите сохранение'), {
        statusCode: 409, code: 'GATEWAY_SETTINGS_CONFLICT',
      });
    }
    const next = mergeGatewaySettings(before, input);
    const { revision, hasProxyPassword: _password, hasWebhookSecret: _secret, ...settings } = presentGatewaySettings(next);
    await connection.execute(
      `UPDATE gateway_settings SET settings_json = ?, proxy_password_encrypted = ?,
       webhook_secret_encrypted = ?, revision = ?, updated_by = ? WHERE id = 1`,
      [JSON.stringify(settings), encryptGatewaySecret(next.proxyPassword), encryptGatewaySecret(next.webhookSecret), revision, actorId],
    );
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
       VALUES (?, 'gateway_settings.update', 'gateway_settings', '1', ?, ?, ?)`,
      [actorId, JSON.stringify(presentGatewaySettings(before)), JSON.stringify({
        ...presentGatewaySettings(next),
        proxyPasswordChanged: before.proxyPassword !== next.proxyPassword,
        webhookSecretChanged: before.webhookSecret !== next.webhookSecret,
      }), ip ?? null],
    );
    return presentGatewaySettings(next);
  });
}
