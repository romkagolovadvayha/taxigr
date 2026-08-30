import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';

import type { Address, RouteSummary, TariffCode, UserRole } from '../src/domain/models';
import type { PricingScope } from '../src/domain/pricing';
import { config } from './config';
import { firstRow } from './db';

const jwtKey = new TextEncoder().encode(config.JWT_SECRET);

export type AuthUser = {
  id: string;
  roles: UserRole[];
};

export type OrderQuoteClaims = {
  passengerId: string;
  pickup: Address;
  destination: Address;
  destinations: Address[];
  pricingScope: PricingScope;
  route: Omit<RouteSummary, 'coordinates'>;
  pricingDistanceMeters: number;
  driverApproachDistanceMeters: number;
  prices: Record<TariffCode, number>;
  pricedAt: string;
};

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function signSession(user: AuthUser): Promise<string> {
  return new SignJWT({ roles: user.roles })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer('taxi-grahovo-api')
    .setAudience('taxi-grahovo-app')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(jwtKey);
}

export async function signOrderQuote(claims: OrderQuoteClaims): Promise<string> {
  return new SignJWT({ quote: claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.passengerId)
    .setIssuer('taxi-grahovo-api')
    .setAudience('taxi-grahovo-order-quote')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(jwtKey);
}

export async function verifyOrderQuote(
  token: string,
  passengerId: string,
): Promise<OrderQuoteClaims> {
  const { payload } = await jwtVerify(token, jwtKey, {
    issuer: 'taxi-grahovo-api',
    audience: 'taxi-grahovo-order-quote',
    subject: passengerId,
  });
  const quote = payload.quote as OrderQuoteClaims | undefined;
  if (!quote || quote.passengerId !== passengerId) throw new Error('Invalid quote payload');
  return quote;
}

export async function verifySession(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, jwtKey, {
    issuer: 'taxi-grahovo-api',
    audience: 'taxi-grahovo-app',
  });
  if (!payload.sub || !Array.isArray(payload.roles)) throw new Error('Invalid session payload');
  return { id: payload.sub, roles: payload.roles as UserRole[] };
}

export async function authenticate(request: FastifyRequest): Promise<AuthUser> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Требуется авторизация'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }
  try {
    const session = await verifySession(authorization.slice(7));
    const active = await firstRow<import('mysql2/promise').RowDataPacket & { id: string }>(
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
      [session.id],
    );
    if (!active) throw new Error('Deleted or missing user');
    return session;
  } catch {
    throw Object.assign(new Error('Сессия недействительна'), { statusCode: 401, code: 'INVALID_SESSION' });
  }
}

export function requireRole(user: AuthUser, role: UserRole): void {
  if (!user.roles.includes(role)) {
    throw Object.assign(new Error('Недостаточно прав'), { statusCode: 403, code: 'FORBIDDEN' });
  }
}
