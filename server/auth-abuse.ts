import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { config } from './config';
import { db, withTransaction } from './db';
import { maskPhone, normalizeRussianPhone } from './phone-verification';

export type AuthAction = 'send_code' | 'verify_code' | 'start_max' | 'start_telegram' | 'start_vk';
export type AuthRateLimitScope = 'phone' | 'ip' | 'subnet' | 'installation';

export type AuthIdentity = {
  ipAddress: string;
  ipFingerprint: string;
  subnet: string;
  subnetFingerprint: string;
  phoneFingerprint?: string;
  phoneMask?: string;
  installationFingerprint?: string;
};

type RateLimitRule = {
  scope: AuthRateLimitScope;
  windowSeconds: number;
  max: number;
};

export type AuthRateLimitResult = {
  scope: AuthRateLimitScope;
  retryAfterSeconds: number;
  windowSeconds: number;
  max: number;
} | null;

const sendCodeRules: readonly RateLimitRule[] = [
  { scope: 'phone', windowSeconds: 30, max: 1 },
  { scope: 'phone', windowSeconds: 1_800, max: 5 },
  { scope: 'phone', windowSeconds: 7_200, max: 10 },
  { scope: 'ip', windowSeconds: 600, max: 10 },
  { scope: 'ip', windowSeconds: 3_600, max: 30 },
  { scope: 'ip', windowSeconds: 7_200, max: 60 },
  { scope: 'subnet', windowSeconds: 3_600, max: 60 },
  { scope: 'subnet', windowSeconds: 7_200, max: 150 },
  { scope: 'installation', windowSeconds: 1_800, max: 8 },
  { scope: 'installation', windowSeconds: 7_200, max: 20 },
] as const;

const verifyCodeRules: readonly RateLimitRule[] = [
  { scope: 'phone', windowSeconds: 600, max: 10 },
  { scope: 'phone', windowSeconds: 3_600, max: 30 },
  { scope: 'ip', windowSeconds: 600, max: 20 },
  { scope: 'ip', windowSeconds: 3_600, max: 60 },
  { scope: 'subnet', windowSeconds: 3_600, max: 120 },
  { scope: 'installation', windowSeconds: 600, max: 20 },
  { scope: 'installation', windowSeconds: 3_600, max: 60 },
] as const;

function fingerprint(scope: string, value: string): string {
  return createHmac('sha256', config.JWT_SECRET)
    .update(`auth-abuse:${scope}:${value}`)
    .digest('hex');
}

function parseIpv6Groups(value: string): number[] | null {
  const withoutZone = value.split('%', 1)[0]?.toLowerCase();
  if (!withoutZone) return null;

  let source = withoutZone;
  const ipv4Tail = source.match(/(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (ipv4Tail) {
    const octets = ipv4Tail.split('.').map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }
    const first = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const second = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    source = source.slice(0, -ipv4Tail.length) + `${first.toString(16)}:${second.toString(16)}`;
  }

  const halves = source.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right].map((part) =>
    Number.parseInt(part || '0', 16),
  );
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return null;
  }
  return groups;
}

export function normalizeClientIp(value: string): string {
  const withoutZone = value.trim().split('%', 1)[0] ?? '';
  if (isIP(withoutZone) === 4) return withoutZone;
  if (isIP(withoutZone) !== 6) return 'unknown';

  const groups = parseIpv6Groups(withoutZone);
  if (!groups) return 'unknown';
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    return `${groups[6]! >> 8}.${groups[6]! & 0xff}.${groups[7]! >> 8}.${groups[7]! & 0xff}`;
  }
  return groups.map((group) => group.toString(16)).join(':');
}

export function clientSubnet(ipAddress: string): string {
  if (isIP(ipAddress) === 4) {
    const octets = ipAddress.split('.');
    return `${octets.slice(0, 3).join('.')}.0/24`;
  }
  if (isIP(ipAddress) === 6) {
    const groups = parseIpv6Groups(ipAddress);
    if (groups) return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
  }
  return 'unknown';
}

export function buildAuthIdentity(
  rawIp: string,
  phone?: string,
  installationId?: string,
): AuthIdentity {
  const ipAddress = normalizeClientIp(rawIp);
  const subnet = clientSubnet(ipAddress);
  const normalizedPhone = phone ? normalizeRussianPhone(phone) : null;
  const phoneSubject = normalizedPhone ?? phone?.trim().slice(0, 64);
  const installationSubject = installationId?.trim().slice(0, 128);

  return {
    ipAddress,
    ipFingerprint: fingerprint('ip', ipAddress),
    subnet,
    subnetFingerprint: fingerprint('subnet', subnet),
    ...(phoneSubject
      ? {
          phoneFingerprint: fingerprint('phone', phoneSubject),
          ...(normalizedPhone ? { phoneMask: maskPhone(normalizedPhone) } : {}),
        }
      : {}),
    ...(installationSubject
      ? { installationFingerprint: fingerprint('installation', installationSubject) }
      : {}),
  };
}

export async function createAuthAttempt(input: {
  requestId: string;
  action: AuthAction;
  identity: AuthIdentity;
  userAgent?: string;
  outcome?: string;
}): Promise<number> {
  const [result] = await db.execute<import('mysql2/promise').ResultSetHeader>(
    `INSERT INTO auth_attempt_events
      (request_id, action, outcome, ip_address, ip_fingerprint, subnet,
       subnet_fingerprint, phone_fingerprint, phone_mask, installation_fingerprint,
       user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.requestId.slice(0, 64),
      input.action,
      input.outcome ?? 'received',
      input.identity.ipAddress,
      input.identity.ipFingerprint,
      input.identity.subnet,
      input.identity.subnetFingerprint,
      input.identity.phoneFingerprint ?? null,
      input.identity.phoneMask ?? null,
      input.identity.installationFingerprint ?? null,
      input.userAgent?.slice(0, 255) ?? null,
    ],
  );
  return result.insertId;
}

export async function finishAuthAttempt(
  eventId: number,
  outcome: string,
  details?: Record<string, unknown>,
  challengeId?: string,
): Promise<void> {
  await db.execute(
    `UPDATE auth_attempt_events
     SET outcome = ?, details_json = ?, challenge_id = COALESCE(?, challenge_id)
     WHERE id = ?`,
    [outcome, details ? JSON.stringify(details) : null, challengeId ?? null, eventId],
  );
}

function subjectForScope(identity: AuthIdentity, scope: AuthRateLimitScope): string | undefined {
  if (scope === 'phone') return identity.phoneFingerprint;
  if (scope === 'ip') return identity.ipFingerprint;
  if (scope === 'subnet') return identity.subnetFingerprint;
  return identity.installationFingerprint;
}

type RateLimitBucket = {
  rule: RateLimitRule;
  subjectHash: string;
  windowStartedAt: Date;
};

function rateLimitBuckets(
  action: AuthAction,
  identity: AuthIdentity,
  now: Date,
): RateLimitBucket[] {
  if (action === 'start_max' || action === 'start_telegram' || action === 'start_vk') return [];
  const rules = action === 'send_code' ? sendCodeRules : verifyCodeRules;
  return rules
    .map((rule) => ({ rule, subjectHash: subjectForScope(identity, rule.scope) }))
    .filter((item): item is { rule: RateLimitRule; subjectHash: string } => Boolean(item.subjectHash))
    .map((item) => ({
      ...item,
      windowStartedAt: new Date(
        Math.floor(now.getTime() / 1_000 / item.rule.windowSeconds) *
          item.rule.windowSeconds *
          1_000,
      ),
    }))
    .sort((left, right) =>
      `${left.rule.scope}:${left.rule.windowSeconds}:${left.subjectHash}`.localeCompare(
        `${right.rule.scope}:${right.rule.windowSeconds}:${right.subjectHash}`,
        'en',
      ),
    );
}

export async function consumeAuthRateLimits(
  action: AuthAction,
  identity: AuthIdentity,
  now = new Date(),
): Promise<AuthRateLimitResult> {
  const applicable = rateLimitBuckets(action, identity, now);

  // Create missing buckets one autocommitted row at a time. Keeping gap-locking inserts
  // outside the multi-row transaction prevents concurrent identities from deadlocking.
  for (const item of applicable) {
    await db.execute(
      `INSERT IGNORE INTO auth_rate_limit_counters
        (action, scope, subject_hash, window_seconds, window_started_at, attempts)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        action,
        item.rule.scope,
        item.subjectHash,
        item.rule.windowSeconds,
        item.windowStartedAt,
      ],
    );
  }

  for (let transactionAttempt = 0; transactionAttempt < 3; transactionAttempt += 1) {
    try {
      return await withTransaction(async (connection) => {
        const counters: { item: RateLimitBucket; attempts: number }[] = [];
        for (const item of applicable) {
          const [rows] = await connection.query<
            (RowDataPacket & { attempts: number })[]
          >(
            `SELECT attempts FROM auth_rate_limit_counters
             WHERE action = ? AND scope = ? AND subject_hash = ?
               AND window_seconds = ? AND window_started_at = ?
             FOR UPDATE`,
            [action, item.rule.scope, item.subjectHash, item.rule.windowSeconds, item.windowStartedAt],
          );
          counters.push({ item, attempts: Number(rows[0]?.attempts ?? 0) });
        }

        const exceeded = counters
          .filter(({ item, attempts }) => attempts >= item.rule.max)
          .map(({ item }) => {
            const windowEnd = item.windowStartedAt.getTime() + item.rule.windowSeconds * 1_000;
            return {
              scope: item.rule.scope,
              retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1_000)),
              windowSeconds: item.rule.windowSeconds,
              max: item.rule.max,
            };
          });
        const blocked = exceeded.sort(
          (left, right) => right.retryAfterSeconds - left.retryAfterSeconds,
        )[0];
        if (blocked) return blocked;

        for (const { item, attempts } of counters) {
          await connection.execute(
            `UPDATE auth_rate_limit_counters
             SET attempts = ?
             WHERE action = ? AND scope = ? AND subject_hash = ?
               AND window_seconds = ? AND window_started_at = ?`,
            [
              attempts + 1,
              action,
              item.rule.scope,
              item.subjectHash,
              item.rule.windowSeconds,
              item.windowStartedAt,
            ],
          );
        }
        return null;
      });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'ER_LOCK_DEADLOCK' || transactionAttempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (transactionAttempt + 1)));
    }
  }
  throw new Error('Rate-limit transaction retries exhausted');
}

export async function refundAuthRateLimits(
  action: AuthAction,
  identity: AuthIdentity,
  now: Date,
): Promise<void> {
  const applicable = rateLimitBuckets(action, identity, now);
  await withTransaction(async (connection) => {
    for (const item of applicable) {
      await connection.execute(
        `UPDATE auth_rate_limit_counters
         SET attempts = GREATEST(0, attempts - 1)
         WHERE action = ? AND scope = ? AND subject_hash = ?
           AND window_seconds = ? AND window_started_at = ?`,
        [action, item.rule.scope, item.subjectHash, item.rule.windowSeconds, item.windowStartedAt],
      );
    }
  });
}

export async function pruneAuthAbuseData(): Promise<void> {
  await db.execute(
    `DELETE FROM auth_attempt_events
     WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL ? DAY`,
    [config.AUTH_ATTEMPT_RETENTION_DAYS],
  );
  await db.execute(
    `DELETE FROM auth_rate_limit_counters
     WHERE window_started_at < UTC_TIMESTAMP(3) - INTERVAL 2 DAY`,
  );
  await db.execute(
    `DELETE FROM max_auth_challenges
     WHERE expires_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY`,
  );
  await db.execute(
    `DELETE FROM telegram_auth_challenges
     WHERE expires_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY`,
  );
}
