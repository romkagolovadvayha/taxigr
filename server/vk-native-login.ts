import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { matchesMessengerPhone } from './messenger-auth-phone';

function invalid(message: string, statusCode = 409): Error {
  return Object.assign(new Error(message), { statusCode, code: 'VK_NATIVE_LOGIN_INVALID' });
}

// The caller must authenticate the taxi session and verify VK's launch signature.
// The public state can approve a login, but cannot redeem a taxi session: that
// still requires the exchangeToken held only by the initiating Android app.
export async function confirmVkNativeLogin(
  connection: PoolConnection,
  input: { state: string; sessionUserId: string; vkUserId: string },
): Promise<void> {
  const [challenges] = await connection.query<(RowDataPacket & {
    id: string;
    expected_phone: string | null;
    vk_user_id: string | null;
    expires_at: Date | string;
    verified_at: Date | string | null;
    completed_at: Date | string | null;
    failure_code: string | null;
  })[]>(
    `SELECT id, expected_phone, vk_user_id, expires_at, verified_at, completed_at, failure_code
     FROM vk_auth_challenges WHERE state_token = ? FOR UPDATE`,
    [input.state],
  );
  const challenge = challenges[0];
  if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw invalid('Попытка входа устарела. Начните вход заново в приложении такси.', 410);
  }
  if (challenge.failure_code || challenge.completed_at ||
    (challenge.verified_at && challenge.vk_user_id !== input.vkUserId)) {
    throw invalid('Эта попытка входа уже завершена. Начните вход заново.');
  }
  const [accounts] = await connection.query<(RowDataPacket & {
    phone: string | null; first_name: string | null; last_name: string | null;
  })[]>(
    `SELECT user.phone, account.first_name, account.last_name
     FROM user_messenger_accounts account
     JOIN users user ON user.id = account.user_id
     WHERE user.id = ? AND user.deleted_at IS NULL AND user.blocked_at IS NULL
       AND account.provider = 'vk' AND account.external_user_id = ? AND account.active = TRUE
     LIMIT 1 FOR UPDATE`,
    [input.sessionUserId, input.vkUserId],
  );
  const account = accounts[0];
  if (!account?.phone || !matchesMessengerPhone(account.phone, challenge.expected_phone)) {
    throw invalid('Аккаунт такси не соответствует подтверждённому профилю VK.', 403);
  }
  if (challenge.verified_at) return; // A retry after a lost response is harmless.
  await connection.execute(
    `UPDATE vk_auth_challenges
     SET verified_phone = ?, vk_user_id = ?, vk_first_name = ?, vk_last_name = ?,
       verified_at = UTC_TIMESTAMP(3)
     WHERE id = ? AND verified_at IS NULL AND completed_at IS NULL`,
    [account.phone, input.vkUserId, account.first_name, account.last_name, challenge.id],
  );
}
