import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

import { db, firstRow } from './db';

const MAX_AVATAR_BYTES = 2_500_000;

type AvatarState = RowDataPacket & {
  avatar_url: string | null;
  avatar_mime: string | null;
  avatar_data: Buffer | null;
};

function isPrivateHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (value === 'localhost' || value.endsWith('.localhost') || value === '::1') return true;
  if (/^(?:127|10|0)\./u.test(value) || /^(?:169\.254|192\.168)\./u.test(value)) return true;
  const match = value.match(/^172\.(\d{1,3})\./u);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export function safeRemoteAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      isPrivateHostname(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function detectImageMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

async function downloadAvatar(
  url: string,
  proxyUrl?: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  try {
    const response = await undiciFetch(url, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
      redirect: 'error',
      signal: controller.signal,
      dispatcher,
    });
    if (!response.ok) return null;
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AVATAR_BYTES) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > MAX_AVATAR_BYTES) return null;
    const mimeType = detectImageMime(data);
    return mimeType ? { data, mimeType } : null;
  } finally {
    clearTimeout(timeout);
    await dispatcher?.close();
  }
}

export async function userHasNoAvatar(userId: string): Promise<boolean> {
  const user = await firstRow<AvatarState>(
    `SELECT avatar_url, avatar_mime, avatar_data
     FROM users WHERE id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return Boolean(
    user && !user.avatar_url && !user.avatar_mime && !user.avatar_data,
  );
}

export async function syncUserAvatarFromRemoteUrlIfEmpty(
  userId: string,
  value: unknown,
  options: { proxyUrl?: string } = {},
): Promise<boolean> {
  const url = safeRemoteAvatarUrl(value);
  if (!url || !(await userHasNoAvatar(userId))) return false;
  const avatar = await downloadAvatar(url, options.proxyUrl);
  if (!avatar) return false;
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE users
     SET avatar_data = ?, avatar_mime = ?, avatar_url = NULL
     WHERE id = ? AND deleted_at IS NULL
       AND avatar_url IS NULL AND avatar_mime IS NULL AND avatar_data IS NULL`,
    [avatar.data, avatar.mimeType, userId],
  );
  return result.affectedRows > 0;
}
