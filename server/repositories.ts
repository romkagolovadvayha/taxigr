import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import type { SessionUser, UserRole } from '../src/domain/models';
import { config } from './config';
import { db, firstRow } from './db';
import {
  normalizeMessengerIdentity,
  type MessengerIdentityInput,
} from './messenger-identity';

type UserRow = RowDataPacket & {
  id: string;
  name: string;
  gender: 'male' | 'female' | null;
  phone: string | null;
  profile_completed_at: Date | string | null;
  avatar_url: string | null;
  avatar_mime: string | null;
  blocked_at: Date | string | null;
  block_reason: string | null;
  updated_at: Date | string;
};

function storedAvatarUrl(user: UserRow): string | undefined {
  if (user.avatar_mime) {
    const version = new Date(user.updated_at).getTime();
    return `/v1/users/${user.id}/avatar?v=${version}`;
  }
  return user.avatar_url ?? undefined;
}

export async function findUserWithRoles(id: string): Promise<SessionUser | null> {
  const user = await firstRow<UserRow>(
    `SELECT id, name, gender, phone, profile_completed_at,
      avatar_url, avatar_mime, blocked_at, block_reason, updated_at
     FROM users
     WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  if (!user) return null;
  const [roleRows] = await db.query<(RowDataPacket & { role: UserRole })[]>(
    'SELECT role FROM user_roles WHERE user_id = ? ORDER BY role',
    [id],
  );
  return {
    id: user.id,
    name: user.name,
    gender: user.gender ?? undefined,
    phone: user.phone ?? undefined,
    profileComplete: Boolean(user.profile_completed_at),
    avatarUrl: storedAvatarUrl(user),
    roles: roleRows.map((row) => row.role),
    blockedAt: user.blocked_at ? new Date(user.blocked_at).toISOString() : undefined,
    blockReason: user.block_reason ?? undefined,
  };
}

export async function findOrCreatePhoneUser(
  connection: PoolConnection,
  phone: string,
): Promise<string> {
  const [existing] = await connection.query<(RowDataPacket & { id: string })[]>(
    'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL FOR UPDATE',
    [phone],
  );
  const id = existing[0]?.id ?? randomUUID();
  if (existing[0]) {
    await connection.execute(
      'UPDATE users SET phone_verified_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [id],
    );
  } else {
    await connection.execute(
      `INSERT INTO users (id, vk_id, name, phone, phone_verified_at)
       VALUES (?, NULL, '', ?, UTC_TIMESTAMP(3))`,
      [id, phone],
    );
  }
  await connection.execute(
    "INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'passenger')",
    [id],
  );
  if (config.superadminPhones.has(phone)) {
    await connection.execute(
      "INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')",
      [id],
    );
  }
  return id;
}

export async function linkMessengerIdentity(
  connection: PoolConnection,
  userId: string,
  input: MessengerIdentityInput,
): Promise<void> {
  const identity = normalizeMessengerIdentity(input);
  if (!identity.externalUserId || !identity.chatId) {
    throw new Error('Messenger identity requires user and chat IDs');
  }

  await connection.execute(
    `UPDATE user_messenger_accounts
     SET active = FALSE, updated_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND provider = ? AND external_user_id <> ? AND active = TRUE`,
    [userId, identity.provider, identity.externalUserId],
  );
  await connection.execute(
    `INSERT INTO user_messenger_accounts
      (user_id, provider, external_user_id, chat_id, username, display_name,
       first_name, last_name, active, bot_contact_available, bot_started_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id), chat_id = VALUES(chat_id),
       username = VALUES(username), display_name = VALUES(display_name),
       first_name = VALUES(first_name), last_name = VALUES(last_name),
       active = TRUE, bot_contact_available = VALUES(bot_contact_available),
       bot_started_at = COALESCE(bot_started_at, UTC_TIMESTAMP(3)),
       last_seen_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)`,
    [
      userId,
      identity.provider,
      identity.externalUserId,
      identity.chatId,
      identity.username,
      identity.displayName,
      identity.firstName,
      identity.lastName,
      identity.botContactAvailable,
    ],
  );

  if (identity.profileName) {
    await connection.execute(
      `UPDATE users SET name = ?
       WHERE id = ? AND profile_completed_at IS NULL AND TRIM(name) = ''`,
      [identity.profileName, userId],
    );
  }
}
