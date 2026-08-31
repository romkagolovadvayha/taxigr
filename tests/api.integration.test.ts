import { randomUUID } from 'node:crypto';

import mysql, { type Connection } from 'mysql2/promise';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  AdminDriverDetail,
  AdminPassengerDetail,
  RideChatMessage,
  RideChatThread,
  RideOrder,
  VehicleChangeRequest,
} from '../src/domain/models';
import type { PricingRules } from '../src/domain/pricing';
import {
  currentDriverLegalAcceptance,
  currentInitialLegalAcceptance,
  legalDocuments,
  type InitialLegalAcceptance,
} from '../src/legal/documents';
import { signSession } from '../server/security';
import { buildAuthIdentity, consumeAuthRateLimits } from '../server/auth-abuse';

const runIntegration = process.env.RUN_API_INTEGRATION === '1';
const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:4100';
const mysqlUrl = process.env.MYSQL_URL ?? 'mysql://root@127.0.0.1:3306/taxi_grahovo';

type ApiResult<T> = {
  status: number;
  data?: T;
  error?: { code?: string; message?: string };
};

const fixture = {
  passengerId: randomUUID(),
  outsiderId: randomUUID(),
  driverUserOneId: randomUUID(),
  driverOneId: randomUUID(),
  vehicleOneId: randomUUID(),
  driverUserTwoId: randomUUID(),
  driverTwoId: randomUUID(),
  vehicleTwoId: randomUUID(),
  applicantId: randomUUID(),
  adminId: randomUUID(),
  profileUserId: randomUUID(),
};

const integrationPhones = [
  '+79000000001',
  '+79000000002',
  '+79000000003',
  '+79000000004',
  '+79000000005',
  '+79000000006',
  '+79000000007',
];

const pickup = {
  id: 'integration-pickup',
  label: 'с. Грахово, ул. Ачинцева, 5',
  details: 'МФЦ',
  coordinates: { latitude: 56.0477, longitude: 51.9586 },
};

const destination = {
  id: 'integration-destination',
  label: 'с. Грахово, ул. Колпакова, 1Б',
  details: 'Церковь',
  coordinates: { latitude: 56.04576, longitude: 51.96165 },
};

let connection: Connection;
let passengerToken = '';
let outsiderToken = '';
let driverOneToken = '';
let driverTwoToken = '';
let applicantToken = '';
let adminToken = '';
let originalTariffs: PricingRules;

async function api<T>(
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: unknown;
  } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  return { status: response.status, ...payload };
}

async function createOrder(
  token: string,
  tariff: 'economy' | 'child' = 'economy',
  key = `integration-${randomUUID()}`,
  deviceId = `integration-device-${token.slice(-24)}`,
  paymentMethod: 'direct' | 'cash' | 'transfer' = 'cash',
  legalAcceptance?: InitialLegalAcceptance,
): Promise<ApiResult<RideOrder>> {
  const quote = await api<{ quoteToken: string }>('/v1/quotes', {
    method: 'POST',
    token,
    body: { pickup, destination },
  });
  if (!quote.data?.quoteToken) return { status: quote.status, error: quote.error };
  return api<RideOrder>('/v1/orders', {
    method: 'POST',
    token,
    body: {
      pickup,
      destination,
      tariff,
      quoteToken: quote.data.quoteToken,
      paymentMethod,
      idempotencyKey: key,
      deviceId,
      legalAcceptance,
    },
  });
}

async function setDriverStatus(token: string, status: 'online' | 'offline') {
  return api<{ status: string }>('/v1/driver/status', {
    method: 'POST',
    token,
    body: { status },
  });
}

function socketEvent<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as (...args: unknown[]) => void));
}

async function cleanup(): Promise<void> {
  const phonePlaceholders = integrationPhones.map(() => '?').join(', ');
  await connection.execute(
    `DELETE o FROM orders o
     JOIN users passenger ON passenger.id = o.passenger_id
     WHERE passenger.phone IN (${phonePlaceholders})`,
    integrationPhones,
  );
  await connection.execute(
    `DELETE application FROM driver_applications application
     JOIN users applicant ON applicant.id = application.user_id
     WHERE applicant.phone IN (${phonePlaceholders})`,
    integrationPhones,
  );
  await connection.execute(
    `DELETE request FROM vehicle_change_requests request
     JOIN drivers d ON d.id = request.driver_id
     JOIN users driver_user ON driver_user.id = d.user_id
     WHERE driver_user.phone IN (${phonePlaceholders})`,
    integrationPhones,
  );
  await connection.execute(
    `DELETE d FROM drivers d
     JOIN users driver_user ON driver_user.id = d.user_id
     WHERE driver_user.phone IN (${phonePlaceholders})`,
    integrationPhones,
  );
  await connection.execute(
    `DELETE FROM users WHERE phone IN (${phonePlaceholders})`,
    integrationPhones,
  );
  await connection.execute(
    `DELETE FROM orders
     WHERE passenger_id IN (?, ?, ?, ?, ?)
       OR driver_id IN (?, ?)`,
    [
      fixture.passengerId,
      fixture.outsiderId,
      fixture.applicantId,
      fixture.driverUserOneId,
      fixture.driverUserTwoId,
      fixture.driverOneId,
      fixture.driverTwoId,
    ],
  );
  await connection.execute(
    'DELETE FROM driver_applications WHERE user_id IN (?, ?, ?)',
    [fixture.passengerId, fixture.outsiderId, fixture.applicantId],
  );
  await connection.execute(
    'DELETE FROM vehicle_change_requests WHERE driver_id IN (?, ?)',
    [fixture.driverOneId, fixture.driverTwoId],
  );
  await connection.execute(
    'DELETE FROM drivers WHERE user_id IN (?, ?, ?)',
    [fixture.driverUserOneId, fixture.driverUserTwoId, fixture.applicantId],
  );
  await connection.execute(
    'DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?)',
    [
      fixture.passengerId,
      fixture.outsiderId,
      fixture.driverUserOneId,
      fixture.driverUserTwoId,
      fixture.applicantId,
      fixture.adminId,
      fixture.profileUserId,
    ],
  );
}

describe.skipIf(!runIntegration)('live API role and order flows', () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(mysqlUrl);
    await cleanup();
    await connection.execute(
      `INSERT INTO users
        (id, name, phone, phone_verified_at, gender, profile_completed_at)
       VALUES
        (?, 'Интеграционный пассажир', '+79000000001', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3)),
        (?, 'Посторонний пассажир', '+79000000002', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3)),
        (?, 'Водитель с креслом', '+79000000003', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3)),
        (?, 'Водитель без кресла', '+79000000004', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3)),
        (?, 'Кандидат в водители', '+79000000005', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3)),
        (?, 'Интеграционный админ', '+79000000006', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3))`,
      [
        fixture.passengerId,
        fixture.outsiderId,
        fixture.driverUserOneId,
        fixture.driverUserTwoId,
        fixture.applicantId,
        fixture.adminId,
      ],
    );
    await connection.execute(
      `INSERT INTO user_roles (user_id, role) VALUES
       (?, 'passenger'), (?, 'passenger'), (?, 'passenger'), (?, 'driver'),
       (?, 'passenger'), (?, 'driver'), (?, 'passenger'), (?, 'passenger'), (?, 'admin')`,
      [
        fixture.passengerId,
        fixture.outsiderId,
        fixture.driverUserOneId,
        fixture.driverUserOneId,
        fixture.driverUserTwoId,
        fixture.driverUserTwoId,
        fixture.applicantId,
        fixture.adminId,
        fixture.adminId,
      ],
    );
    const initialAcceptance = currentInitialLegalAcceptance();
    const consentDocuments = [
      [legalDocuments.terms.type, initialAcceptance.termsVersion],
      [legalDocuments.passengerRules.type, initialAcceptance.passengerRulesVersion],
      [legalDocuments.privacy.type, initialAcceptance.privacyVersion],
      [legalDocuments.personalDataConsent.type, initialAcceptance.personalDataConsentVersion],
    ] as const;
    for (const userId of [
      fixture.passengerId,
      fixture.outsiderId,
      fixture.driverUserOneId,
      fixture.driverUserTwoId,
      fixture.applicantId,
      fixture.adminId,
    ]) {
      for (const [documentType, documentVersion] of consentDocuments) {
        await connection.execute(
          `INSERT INTO user_consents
            (user_id, document_type, document_version, source)
           VALUES (?, ?, ?, 'phone_auth')`,
          [userId, documentType, documentVersion],
        );
      }
    }
    await connection.execute(
      `INSERT INTO drivers (id, user_id, status, has_child_seat) VALUES
       (?, ?, 'offline', TRUE), (?, ?, 'offline', FALSE)`,
      [
        fixture.driverOneId,
        fixture.driverUserOneId,
        fixture.driverTwoId,
        fixture.driverUserTwoId,
      ],
    );
    await connection.execute(
      `INSERT INTO vehicles (id, driver_id, make, model, year, color, color_hex, plate) VALUES
       (?, ?, 'Lada', 'Granta', 2022, 'Белая', '#F7F7F2', ?),
       (?, ?, 'Renault', 'Logan', 2021, 'Серая', '#777C84', ?)`,
      [
        fixture.vehicleOneId,
        fixture.driverOneId,
        `Т${fixture.vehicleOneId.slice(0, 6).toUpperCase()}`,
        fixture.vehicleTwoId,
        fixture.driverTwoId,
        `Т${fixture.vehicleTwoId.slice(0, 6).toUpperCase()}`,
      ],
    );
    passengerToken = await signSession({ id: fixture.passengerId, roles: ['passenger'] });
    outsiderToken = await signSession({ id: fixture.outsiderId, roles: ['passenger'] });
    driverOneToken = await signSession({
      id: fixture.driverUserOneId,
      roles: ['passenger', 'driver'],
    });
    driverTwoToken = await signSession({
      id: fixture.driverUserTwoId,
      roles: ['passenger', 'driver'],
    });
    applicantToken = await signSession({ id: fixture.applicantId, roles: ['passenger'] });
    adminToken = await signSession({
      id: fixture.adminId,
      roles: ['passenger', 'admin'],
    });
    const tariffs = await api<PricingRules>('/v1/admin/tariffs', { token: adminToken });
    expect(tariffs.status).toBe(200);
    originalTariffs = tariffs.data!;
  }, 30_000);

  beforeEach(async () => {
    await connection.execute(
      'DELETE FROM orders WHERE passenger_id IN (?, ?, ?, ?)',
      [
        fixture.passengerId,
        fixture.outsiderId,
        fixture.driverUserOneId,
        fixture.driverUserTwoId,
      ],
    );
    await connection.execute(
      `UPDATE users
       SET order_blocked_until = NULL, order_block_reason = NULL,
         blocked_at = NULL, block_reason = NULL, blocked_by = NULL
       WHERE id IN (?, ?)`,
      [fixture.passengerId, fixture.outsiderId],
    );
  });

  afterAll(async () => {
    if (originalTariffs) {
      await api('/v1/admin/tariffs', {
        method: 'PUT',
        token: adminToken,
        body: originalTariffs,
      });
    }
    await cleanup();
    await connection.end();
  });

  it('rejects an untrusted browser origin without reporting an internal error', async () => {
    const response = await fetch(`${apiUrl}/health/live`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe('CORS_ORIGIN_DENIED');
    expect(payload.error?.message).toBe('Origin is not allowed');
  });

  it('protects private endpoints and enforces roles', async () => {
    expect((await api('/v1/me')).status).toBe(401);
    expect((await api('/v1/admin/metrics', { token: passengerToken })).status).toBe(403);
    expect((await api('/v1/driver/profile', { token: passengerToken })).status).toBe(403);
    expect((await api('/v1/quotes', { token: driverOneToken, method: 'POST', body: {} })).status).toBe(
      400,
    );
  });

  it('isolates driver profiles by session and forbids private response caching', async () => {
    const first = await fetch(`${apiUrl}/v1/driver/profile`, {
      headers: { Authorization: `Bearer ${driverOneToken}` },
    });
    const second = await fetch(`${apiUrl}/v1/driver/profile`, {
      headers: { Authorization: `Bearer ${driverTwoToken}` },
    });
    const firstPayload = (await first.json()) as { data?: { userId: string; id: string } };
    const secondPayload = (await second.json()) as { data?: { userId: string; id: string } };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstPayload.data).toMatchObject({
      userId: fixture.driverUserOneId,
      id: fixture.driverOneId,
    });
    expect(secondPayload.data).toMatchObject({
      userId: fixture.driverUserTwoId,
      id: fixture.driverTwoId,
    });
    expect(secondPayload.data?.userId).not.toBe(firstPayload.data?.userId);
    expect(first.headers.get('cache-control')).toContain('no-store');
    expect(second.headers.get('cache-control')).toContain('no-store');
  });

  it('registers an authenticated browser push subscription', async () => {
    const configResponse = await api<{ supported: boolean; vapidPublicKey: string | null }>(
      '/v1/push/config',
      { token: passengerToken },
    );
    expect(configResponse.status).toBe(200);
    expect(configResponse.data?.supported).toBe(true);
    expect(configResponse.data?.vapidPublicKey).toBeTruthy();

    const endpoint = `https://push.example.test/${fixture.passengerId}`;
    const registration = await api('/v1/web-push-subscriptions', {
      method: 'PUT',
      token: passengerToken,
      body: {
        endpoint,
        expirationTime: null,
        keys: {
          p256dh: 'test-browser-public-key-1234567890',
          auth: 'test-auth-secret-12345',
        },
      },
    });
    expect(registration.status).toBe(200);
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT user_id, endpoint FROM web_push_subscriptions WHERE user_id = ?',
      [fixture.passengerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: fixture.passengerId, endpoint });
  });

  it('defers legal consent until the first order and enforces it server-side', async () => {
    await connection.execute(
      'UPDATE user_consents SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ?',
      [fixture.outsiderId],
    );

    const before = await api<{ legalConsentRequired: boolean }>('/v1/auth/refresh', {
      method: 'POST',
      token: outsiderToken,
    });
    expect(before.status).toBe(200);
    expect(before.data?.legalConsentRequired).toBe(true);

    const denied = await createOrder(outsiderToken);
    expect(denied.status).toBe(403);
    expect(denied.error?.code).toBe('LEGAL_CONSENT_REQUIRED');

    const accepted = await createOrder(
      outsiderToken,
      'economy',
      `integration-consent-${randomUUID()}`,
      `integration-consent-device-${randomUUID()}`,
      'cash',
      currentInitialLegalAcceptance(),
    );
    expect(accepted.status, JSON.stringify(accepted.error)).toBe(201);

    const after = await api<{ legalConsentRequired: boolean }>('/v1/auth/refresh', {
      method: 'POST',
      token: outsiderToken,
    });
    expect(after.status).toBe(200);
    expect(after.data?.legalConsentRequired).toBe(false);

    await api(`/v1/orders/${accepted.data!.id}/cancel`, {
      method: 'POST',
      token: outsiderToken,
    });
  });

  it('accepts only cash or transfer for new orders', async () => {
    const rejected = await createOrder(
      passengerToken,
      'economy',
      `integration-direct-payment-${randomUUID()}`,
      `integration-direct-payment-device-${randomUUID()}`,
      'direct',
    );
    expect(rejected.status).toBe(400);
    expect(rejected.error?.code).toBe('VALIDATION_ERROR');
  });

  it('lists account details and enforces reasoned account blocks', async () => {
    const passengers = await api<Array<{ id: string; blockedAt?: string }>>(
      '/v1/admin/passengers',
      { token: adminToken },
    );
    expect(passengers.status).toBe(200);
    expect(passengers.data?.some((passenger) => passenger.id === fixture.passengerId)).toBe(true);

    const passenger = await api<AdminPassengerDetail>(
      `/v1/admin/passengers/${fixture.passengerId}`,
      { token: adminToken },
    );
    expect(passenger.status).toBe(200);
    expect(passenger.data?.user.name).toBe('Интеграционный пассажир');

    const driver = await api<AdminDriverDetail>(
      `/v1/admin/drivers/${fixture.driverOneId}`,
      { token: adminToken },
    );
    expect(driver.status).toBe(200);
    expect(driver.data?.user.id).toBe(fixture.driverUserOneId);
    expect(driver.data?.driver.vehicle?.model).toBe('Granta');

    const missingReason = await api(`/v1/admin/users/${fixture.passengerId}/block`, {
      method: 'PATCH',
      token: adminToken,
      body: { blocked: true },
    });
    expect(missingReason.status).toBe(400);
    expect(missingReason.error?.code).toBe('VALIDATION_ERROR');

    const blocked = await api(`/v1/admin/users/${fixture.passengerId}/block`, {
      method: 'PATCH',
      token: adminToken,
      body: { blocked: true, reason: 'Систематическое нарушение правил' },
    });
    expect(blocked.status).toBe(200);

    const refreshed = await api<{
      user: { blockedAt?: string; blockReason?: string };
    }>('/v1/auth/refresh', { method: 'POST', token: passengerToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.data?.user.blockedAt).toBeTruthy();
    expect(refreshed.data?.user.blockReason).toBe('Систематическое нарушение правил');

    const denied = await api('/v1/orders?scope=passenger', { token: passengerToken });
    expect(denied.status).toBe(403);
    expect(denied.error?.code).toBe('USER_BLOCKED');

    const unblocked = await api(`/v1/admin/users/${fixture.passengerId}/block`, {
      method: 'PATCH',
      token: adminToken,
      body: { blocked: false },
    });
    expect(unblocked.status).toBe(200);
    expect((await api('/v1/orders?scope=passenger', { token: passengerToken })).status).toBe(200);

    await connection.execute(
      `UPDATE users
       SET order_blocked_until = TIMESTAMPADD(HOUR, 24, UTC_TIMESTAMP(3)),
         order_block_reason = 'Частые отмены'
       WHERE id = ?`,
      [fixture.passengerId],
    );
    const temporarilyBlocked = await api<AdminPassengerDetail>(
      `/v1/admin/passengers/${fixture.passengerId}`,
      { token: adminToken },
    );
    expect(temporarilyBlocked.status).toBe(200);
    expect(temporarilyBlocked.data?.user.orderBlockedUntil).toBeTruthy();
    const orderUnblocked = await api(
      `/v1/admin/passengers/${fixture.passengerId}/order-block`,
      { method: 'DELETE', token: adminToken },
    );
    expect(orderUnblocked.status).toBe(200);
    const [orderBlockRows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT order_blocked_until, order_block_reason FROM users WHERE id = ?',
      [fixture.passengerId],
    );
    expect(orderBlockRows[0]?.order_blocked_until).toBeNull();
    expect(orderBlockRows[0]?.order_block_reason).toBeNull();
  });

  it('updates profile and avatar', async () => {
    await connection.execute(
      `INSERT INTO users (id, name, phone, phone_verified_at)
       VALUES (?, 'Новый пользователь', '+79000000007', UTC_TIMESTAMP(3))`,
      [fixture.profileUserId],
    );
    await connection.execute(
      "INSERT INTO user_roles (user_id, role) VALUES (?, 'passenger')",
      [fixture.profileUserId],
    );
    const token = await signSession({ id: fixture.profileUserId, roles: ['passenger'] });

    const profile = await api<{
      name: string;
      gender: string;
      profileComplete: boolean;
    }>('/v1/me/profile', {
      method: 'PUT',
      token,
      body: { name: 'Анна Петрова', gender: 'female' },
    });
    expect(profile.status).toBe(200);
    expect(profile.data).toMatchObject({
      name: 'Анна Петрова',
      gender: 'female',
      profileComplete: true,
    });

    const avatar = await api<{ avatarUrl?: string }>('/v1/me/avatar', {
      method: 'PUT',
      token,
      body: {
        mimeType: 'image/png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZK1sAAAAASUVORK5CYII=',
      },
    });
    expect(avatar.status).toBe(200);
    expect(avatar.data?.avatarUrl).toMatch(
      new RegExp(`^/v1/users/${fixture.profileUserId}/avatar\\?v=\\d+$`),
    );
  });

  it('searches Grahovo addresses for passengers and in local demo mode', async () => {
    const query = encodeURIComponent('Ачинцева');
    const passengerSearch = await api<
      { label: string; coordinates: { latitude: number; longitude: number } }[]
    >(`/v1/addresses/search?query=${query}`, { token: passengerToken });
    expect(passengerSearch.status).toBe(200);
    expect(passengerSearch.data?.[0]?.label).toContain('Грахово');

    const demoSearch = await api<
      { label: string; coordinates: { latitude: number; longitude: number } }[]
    >(`/v1/addresses/preview?query=${query}`);
    expect(demoSearch.status).toBe(200);
    expect(demoSearch.data?.[0]?.coordinates.latitude).toBeGreaterThan(55.9);

    const porshur = await api<
      { label: string; houseNumber?: string; coordinates: { latitude: number; longitude: number } }[]
    >(`/v1/addresses/preview?query=${encodeURIComponent('Поршур Бабаева 32')}`);
    expect(porshur.status).toBe(200);
    expect(porshur.data).toHaveLength(1);
    expect(porshur.data?.[0]).toMatchObject({
      label: 'д. Поршур, ул. Бабаева, 32',
      houseNumber: '32',
    });
    expect(porshur.data?.[0]?.coordinates.latitude).toBeCloseTo(56.0248498, 6);
  });

  it('calculates both tariffs and validates malformed requests', async () => {
    const quote = await api<{
      quoteToken: string;
      pricingScope: string;
      route: {
        distanceMeters: number;
        durationSeconds: number;
        coordinates: { latitude: number; longitude: number }[];
      };
      tariffs: { code: string; priceMinor: number; childSeatIncluded: boolean }[];
    }>('/v1/quotes', {
      method: 'POST',
      token: passengerToken,
      body: { pickup, destination },
    });
    expect(quote.status).toBe(200);
    expect(quote.data?.quoteToken.length).toBeGreaterThan(100);
    expect(quote.data?.pricingScope).toBe('grahovo');
    expect(quote.data?.route.distanceMeters).toBeGreaterThan(0);
    expect(quote.data?.route.durationSeconds).toBeGreaterThan(0);
    expect(quote.data?.route.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(quote.data?.tariffs.map((tariff) => tariff.code)).toEqual(['economy', 'child']);
    expect(quote.data?.tariffs[1]?.childSeatIncluded).toBe(true);
    expect(quote.data?.tariffs[1]?.priceMinor).toBeGreaterThan(
      quote.data?.tariffs[0]?.priceMinor ?? 0,
    );
    expect(quote.data?.tariffs[0]?.priceMinor).toBe(15_000);

    const secondLocalDestination = {
      id: 'integration-second-local-destination',
      label: 'ул. 50 лет Победы, 19',
      details: 'с. Грахово, Граховский район, Удмуртская Республика',
      houseNumber: '19',
      coordinates: { latitude: 56.055332, longitude: 51.960263 },
    };
    const multiStopQuote = await api<{
      quoteToken: string;
      route: { coordinates: { latitude: number; longitude: number }[] };
      tariffs: { code: string; priceMinor: number }[];
    }>('/v1/quotes', {
      method: 'POST',
      token: passengerToken,
      body: {
        pickup,
        destinations: [destination, secondLocalDestination],
        destination: secondLocalDestination,
      },
    });
    const baseEconomyPrice = quote.data?.tariffs[0]?.priceMinor ?? 0;
    expect(multiStopQuote.status).toBe(200);
    expect(multiStopQuote.data?.route.coordinates.length).toBeGreaterThanOrEqual(3);
    expect(multiStopQuote.data?.tariffs[0]?.priceMinor).toBe(
      baseEconomyPrice +
        Math.round(
          (baseEconomyPrice * originalTariffs.additionalStopGrahovoSurchargeBps) / 10_000,
        ),
    );

    const tamperedOrder = await api('/v1/orders', {
      method: 'POST',
      token: passengerToken,
      body: {
        pickup,
        destination: {
          ...destination,
          coordinates: { latitude: 56.4439, longitude: 52.2274 },
        },
        tariff: 'economy',
        quoteToken: quote.data!.quoteToken,
        paymentMethod: 'cash',
        idempotencyKey: `integration-tampered-${randomUUID()}`,
        deviceId: `integration-tampered-device-${randomUUID()}`,
      },
    });
    expect(tamperedOrder.status).toBe(409);
    expect(tamperedOrder.error?.code).toBe('QUOTE_ADDRESS_MISMATCH');

    const demoNearQuote = await api<{
      route: { distanceMeters: number; durationSeconds: number };
      tariffs: { code: string; priceMinor: number }[];
    }>('/v1/routes/preview', {
      method: 'POST',
      body: { pickup, destination },
    });
    const demoFarQuote = await api<{
      pricingScope: string;
      route: { distanceMeters: number; durationSeconds: number };
      tariffs: { code: string; priceMinor: number }[];
    }>('/v1/routes/preview', {
      method: 'POST',
      body: {
        pickup,
        destination: {
          id: 'demo-far-mozhga',
          label: 'г. Можга, Привокзальная ул., 6',
          houseNumber: '6',
          coordinates: { latitude: 56.445658, longitude: 52.1972249 },
        },
      },
    });
    const settlementDestination = {
      id: 'osm-alnashi',
      label: 'Алнаши',
      details: 'Алнашский район, Удмуртия, Россия',
      kind: 'settlement',
      coordinates: { latitude: 56.1848812, longitude: 52.4755309 },
    };
    const settlementQuote = await api<{
      pricingScope: string;
      route: { distanceMeters: number; durationSeconds: number };
      tariffs: { code: string; priceMinor: number }[];
    }>('/v1/routes/preview', {
      method: 'POST',
      body: { pickup, destination: settlementDestination },
    });
    expect(demoNearQuote.status).toBe(200);
    expect(demoFarQuote.status).toBe(200);
    expect(settlementQuote.status).toBe(200);
    expect(demoFarQuote.data?.pricingScope).toBe('intercity');
    expect(settlementQuote.data?.pricingScope).toBe('intercity');
    expect(demoNearQuote.data?.tariffs.map((tariff) => tariff.code)).toEqual([
      'economy',
      'child',
    ]);
    expect(demoFarQuote.data?.route.distanceMeters).toBeGreaterThan(
      demoNearQuote.data?.route.distanceMeters ?? 0,
    );
    expect(demoFarQuote.data?.tariffs[0]?.priceMinor).toBeGreaterThan(
      demoNearQuote.data?.tariffs[0]?.priceMinor ?? 0,
    );
    expect(settlementQuote.data?.route.distanceMeters).toBeGreaterThan(30_000);

    for (const routeCase of [
      {
        label: 'д. Благодатное, ул. Благодатновская, 53А',
        houseNumber: '53А',
        coordinates: { latitude: 55.9995786, longitude: 51.8684492 },
        minimumMeters: 5_000,
      },
      {
        label: 'г. Можга, Привокзальная ул., 6',
        houseNumber: '6',
        coordinates: { latitude: 56.445658, longitude: 52.1972249 },
        minimumMeters: 40_000,
      },
    ]) {
      const routed = await api<{
        route: {
          distanceMeters: number;
          durationSeconds: number;
          source: string;
          coordinates: { latitude: number; longitude: number }[];
        };
      }>('/v1/quotes', {
        method: 'POST',
        token: passengerToken,
        body: {
          pickup,
          destination: {
            id: `route-${routeCase.label}`,
            label: routeCase.label,
            coordinates: routeCase.coordinates,
          },
        },
      });
      expect(routed.status).toBe(200);
      expect(routed.data?.route.distanceMeters).toBeGreaterThan(routeCase.minimumMeters);
      expect(routed.data?.route.durationSeconds).toBeGreaterThan(0);
      expect(routed.data?.route.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(['osrm', 'estimate']).toContain(routed.data?.route.source);
    }

    const missingHouse = await api('/v1/quotes', {
      method: 'POST',
      token: passengerToken,
      body: {
        pickup,
        destination: {
          id: 'street-only',
          label: 'ул. Советская',
          coordinates: { latitude: 56.047, longitude: 51.958 },
        },
      },
    });
    expect(missingHouse.status).toBe(400);
    expect(missingHouse.error?.code).toBe('VALIDATION_ERROR');

    const settlementPickup = await api('/v1/routes/preview', {
      method: 'POST',
      body: {
        pickup: settlementDestination,
        destination,
      },
    });
    expect(settlementPickup.status).toBe(400);
    expect(settlementPickup.error?.code).toBe('VALIDATION_ERROR');

    const multiStopOrder = await api<RideOrder>('/v1/orders', {
      method: 'POST',
      token: passengerToken,
      body: {
        pickup,
        destinations: [destination, secondLocalDestination],
        destination: secondLocalDestination,
        tariff: 'economy',
        quoteToken: multiStopQuote.data!.quoteToken,
        paymentMethod: 'cash',
        idempotencyKey: `integration-multi-stop-${randomUUID()}`,
        deviceId: `integration-multi-stop-device-${randomUUID()}`,
      },
    });
    expect(multiStopOrder.status).toBe(201);
    expect(multiStopOrder.data?.destinations?.map((item) => item.label)).toEqual([
      destination.label,
      secondLocalDestination.label,
    ]);
    expect(multiStopOrder.data?.destination.label).toBe(secondLocalDestination.label);

    const invalid = await api('/v1/orders', {
      method: 'POST',
      token: passengerToken,
      body: { pickup, destination, tariff: 'luxury', idempotencyKey: 'short' },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.error?.code).toBe('VALIDATION_ERROR');
  }, 15_000);

  it('verifies the passenger phone and enforces active-order identities', async () => {
    const outsiderPhone = `+790${String(Date.now() % 100_000_000).padStart(8, '0')}`;
    const sharedDevice = `integration-shared-device-${randomUUID()}`;
    const authInstallationId = `integration-auth-${randomUUID()}`;
    const authIdentity = buildAuthIdentity('127.0.0.1', outsiderPhone, authInstallationId);

    await connection.execute(
      'UPDATE users SET phone = ?, phone_verified_at = NULL WHERE id = ?',
      [outsiderPhone, fixture.outsiderId],
    );
    await connection.execute(
      `DELETE FROM auth_rate_limit_counters
       WHERE subject_hash IN (?, ?, ?, ?)`,
      [
        authIdentity.phoneFingerprint!,
        authIdentity.ipFingerprint,
        authIdentity.subnetFingerprint,
        authIdentity.installationFingerprint!,
      ],
    );
    const unverifiedOrder = await createOrder(outsiderToken);

    const sent = await api<{
      debugCode?: string;
    }>('/v1/auth/phone/start', {
      method: 'POST',
      body: {
        phone: outsiderPhone,
        installationId: authInstallationId,
        legalAcceptance: currentInitialLegalAcceptance(),
      },
    });
    const sentAgain = await api('/v1/auth/phone/start', {
      method: 'POST',
      body: {
        phone: outsiderPhone,
        installationId: authInstallationId,
        legalAcceptance: currentInitialLegalAcceptance(),
      },
    });
    const rejectedCode = await api('/v1/auth/phone/verify', {
      method: 'POST',
      body: {
        phone: outsiderPhone,
        code: sent.data?.debugCode === '0000' ? '0001' : '0000',
        installationId: authInstallationId,
      },
    });
    const verified = await api<{ token: string }>('/v1/auth/phone/verify', {
      method: 'POST',
      body: {
        phone: outsiderPhone,
        code: sent.data?.debugCode,
        installationId: authInstallationId,
      },
    });

    const [attemptRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT action, outcome, ip_address, installation_fingerprint
       FROM auth_attempt_events
       WHERE installation_fingerprint = ?
       ORDER BY id`,
      [authIdentity.installationFingerprint],
    );
    const [counterRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT scope
       FROM auth_rate_limit_counters
       WHERE action = 'send_code' AND (
         (scope = 'phone' AND subject_hash = ?) OR
         (scope = 'ip' AND subject_hash = ?) OR
         (scope = 'subnet' AND subject_hash = ?) OR
         (scope = 'installation' AND subject_hash = ?)
       )`,
      [
        authIdentity.phoneFingerprint,
        authIdentity.ipFingerprint,
        authIdentity.subnetFingerprint,
        authIdentity.installationFingerprint,
      ],
    );

    const order = await createOrder(
      verified.data!.token,
      'economy',
      `integration-identity-${randomUUID()}`,
      sharedDevice,
      'cash',
    );
    const available = await api<RideOrder[]>('/v1/driver/orders/available', {
      token: driverOneToken,
    });

    const sameDeviceOrder = await createOrder(
      passengerToken,
      'economy',
      `integration-same-device-${randomUUID()}`,
      sharedDevice,
    );
    const sameAccount = await createOrder(
      outsiderToken,
      'economy',
      `integration-same-account-${randomUUID()}`,
      `integration-other-device-${randomUUID()}`,
    );

    await setDriverStatus(driverOneToken, 'online');
    const accepted = await api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST',
      token: driverOneToken,
      body: {},
    });
    await api(`/v1/orders/${order.data!.id}/cancel`, {
      method: 'POST',
      token: outsiderToken,
    });

    expect(unverifiedOrder.status).toBe(403);
    expect(unverifiedOrder.error?.code).toBe('PHONE_VERIFICATION_REQUIRED');
    expect(sent.status).toBe(200);
    expect(sent.data?.debugCode).toMatch(/^\d{4}$/);
    expect(sentAgain.status).toBe(429);
    expect(sentAgain.error?.code).toBe('PHONE_CODE_TOO_SOON');
    expect(sentAgain.error?.message).toMatch(/через \d+ (?:секунд[уы]?|минут[уы]?)/u);
    expect(rejectedCode.status).toBe(400);
    expect(rejectedCode.error?.code).toBe('PHONE_CODE_INVALID');
    expect(verified.status).toBe(200);
    expect(attemptRows.map((row) => [row.action, row.outcome])).toEqual([
      ['send_code', 'sms_sent'],
      ['send_code', 'too_soon'],
      ['verify_code', 'invalid_code'],
      ['verify_code', 'verified'],
    ]);
    expect(attemptRows.every((row) => row.ip_address === '127.0.0.1')).toBe(true);
    expect(counterRows.map((row) => row.scope).sort()).toEqual([
      'installation',
      'ip',
      'phone',
      'subnet',
    ]);
    expect(order.status).toBe(201);
    expect(order.data?.paymentMethod).toBe('cash');
    expect(
      available.data?.find((ride) => ride.id === order.data?.id)?.passenger?.phone,
    ).toBeUndefined();
    expect(sameDeviceOrder.status).toBe(409);
    expect(sameAccount.status).toBe(409);
    expect(accepted.status).toBe(200);
    expect(accepted.data?.passenger?.phone).toBe(outsiderPhone);
  }, 30_000);

  it('increments installation limits atomically under concurrent requests', async () => {
    const installationId = `integration-rate-${randomUUID()}`;
    const base = Date.now() % 10_000_000;
    const identities = Array.from({ length: 9 }, (_, index) =>
      buildAuthIdentity(
        '198.51.100.77',
        `+790${String(base + index).padStart(8, '0')}`,
        installationId,
      ),
    );
    const subjects = new Set(
      identities
        .flatMap((identity) => [
          identity.phoneFingerprint,
          identity.ipFingerprint,
          identity.subnetFingerprint,
          identity.installationFingerprint,
        ])
        .filter((value): value is string => Boolean(value)),
    );
    expect(new Set(identities.map((identity) => identity.installationFingerprint)).size).toBe(1);
    await connection.query(
      `DELETE FROM auth_rate_limit_counters
       WHERE subject_hash IN (${Array.from(subjects, () => '?').join(',')})`,
      [...subjects],
    );

    const results = await Promise.all(
      identities.map((identity) => consumeAuthRateLimits('send_code', identity)),
    );
    const [installationRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT window_seconds, attempts
       FROM auth_rate_limit_counters
       WHERE action = 'send_code' AND scope = 'installation' AND subject_hash = ?
       ORDER BY window_seconds`,
      [identities[0]!.installationFingerprint],
    );

    expect(installationRows.map((row) => [row.window_seconds, row.attempts])).toEqual([
      [1_800, 8],
      [7_200, 8],
    ]);
    expect(results.filter((result) => result === null)).toHaveLength(8);
    expect(results.filter((result) => result?.scope === 'installation')).toHaveLength(1);
  });

  it('does not rate-limit MAX or count MAX starts as SMS attempts', async () => {
    const identity = buildAuthIdentity(
      '198.51.100.91',
      '+79001234567',
      `integration-max-rate-${randomUUID()}`,
    );
    const subjects = [
      identity.phoneFingerprint,
      identity.ipFingerprint,
      identity.subnetFingerprint,
      identity.installationFingerprint,
    ].filter((value): value is string => Boolean(value));
    await connection.query(
      `DELETE FROM auth_rate_limit_counters
       WHERE subject_hash IN (${subjects.map(() => '?').join(',')})`,
      subjects,
    );

    const maxResults = await Promise.all(
      Array.from({ length: 20 }, () => consumeAuthRateLimits('start_max', identity)),
    );
    const smsResult = await consumeAuthRateLimits('send_code', identity);
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT action, SUM(attempts) AS attempts
       FROM auth_rate_limit_counters
       WHERE subject_hash IN (${subjects.map(() => '?').join(',')})
       GROUP BY action`,
      subjects,
    );

    expect(maxResults.every((result) => result === null)).toBe(true);
    expect(smsResult).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('send_code');
    expect(Number(rows[0]?.attempts)).toBeGreaterThan(0);
  });

  it('temporarily blocks ordering after three passenger cancellations in 24 hours', async () => {
    for (let cancellation = 0; cancellation < 3; cancellation += 1) {
      const order = await createOrder(
        passengerToken,
        'economy',
        `integration-cancellation-${cancellation}-${randomUUID()}`,
      );
      expect(order.status).toBe(201);
      const cancelled = await api(`/v1/orders/${order.data!.id}/cancel`, {
        method: 'POST',
        token: passengerToken,
      });
      expect(cancelled.status).toBe(200);
    }

    const blocked = await createOrder(passengerToken);
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT order_blocked_until, order_block_reason FROM users WHERE id = ?',
      [fixture.passengerId],
    );

    expect(blocked.status).toBe(403);
    expect(blocked.error?.code).toBe('ACCOUNT_TEMPORARILY_BLOCKED');
    expect(new Date(rows[0]?.order_blocked_until).getTime()).toBeGreaterThan(Date.now());
    expect(rows[0]?.order_block_reason).toContain('Частые отмены');
  }, 30_000);

  it('creates orders idempotently and isolates passenger data', async () => {
    const key = `integration-idempotency-${randomUUID()}`;
    const first = await createOrder(passengerToken, 'economy', key);
    const replay = await createOrder(passengerToken, 'economy', key);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.data?.id).toBe(first.data?.id);
    const secondActive = await createOrder(passengerToken);
    expect(secondActive.status).toBe(409);
    expect(secondActive.error?.code).toBe('ACTIVE_ORDER_EXISTS');
    expect((await api(`/v1/orders/${first.data!.id}`, { token: outsiderToken })).status).toBe(403);
    expect((await api('/v1/orders', { token: outsiderToken })).data).toEqual([]);
    await api(`/v1/orders/${first.data!.id}/cancel`, { method: 'POST', token: passengerToken });
  }, 15_000);

  it('offers a confirmed price increase every four minutes of the same search', async () => {
    const created = await createOrder(passengerToken);
    expect(created.status).toBe(201);
    const originalPrice = created.data!.priceMinor;

    const tooEarly = await api<RideOrder>(
      `/v1/orders/${created.data!.id}/search-price-increase`,
      { method: 'POST', token: passengerToken },
    );
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.error?.code).toBe('PRICE_INCREASE_TOO_EARLY');

    const forbidden = await api<RideOrder>(
      `/v1/orders/${created.data!.id}/search-price-increase`,
      { method: 'POST', token: outsiderToken },
    );
    expect(forbidden.status).toBe(403);

    await connection.execute(
      'UPDATE orders SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 4 MINUTE) WHERE id = ?',
      [created.data!.id],
    );
    const beforeIncrease = await api<RideOrder>(`/v1/orders/${created.data!.id}`, {
      token: passengerToken,
    });
    expect(beforeIncrease.status).toBe(200);
    const confirmed = await api<RideOrder>(
      `/v1/orders/${created.data!.id}/search-price-increase`,
      { method: 'POST', token: passengerToken },
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.data?.searchPriceIncreaseMinor).toBe(3_000);
    expect(confirmed.data?.priceMinor).toBe(originalPrice + 3_000);
    expect(confirmed.data?.createdAt).toBe(beforeIncrease.data?.createdAt);

    const repeated = await api<RideOrder>(
      `/v1/orders/${created.data!.id}/search-price-increase`,
      { method: 'POST', token: passengerToken },
    );
    expect(repeated.status).toBe(200);
    expect(repeated.data?.priceMinor).toBe(originalPrice + 3_000);

    await connection.execute(
      'UPDATE orders SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 8 MINUTE) WHERE id = ?',
      [created.data!.id],
    );
    const secondInterval = await api<RideOrder>(
      `/v1/orders/${created.data!.id}/search-price-increase`,
      { method: 'POST', token: passengerToken },
    );
    expect(secondInterval.status).toBe(200);
    expect(secondInterval.data?.searchPriceIncreaseMinor).toBe(6_000);
    expect(secondInterval.data?.priceMinor).toBe(originalPrice + 6_000);
    expect(secondInterval.data?.searchPriceIncreaseLastSlot).toBe(2);
  });

  it('allows exactly one driver to win an acceptance race', async () => {
    await setDriverStatus(driverOneToken, 'online');
    await setDriverStatus(driverTwoToken, 'online');
    const order = await createOrder(passengerToken);
    expect(order.status).toBe(201);

    const [one, two] = await Promise.all([
      api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
        method: 'POST',
        token: driverOneToken,
        body: {},
      }),
      api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
        method: 'POST',
        token: driverTwoToken,
        body: {},
      }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const accepted = one.status === 200 ? one.data! : two.data!;
    const winnerId = one.status === 200 ? fixture.driverOneId : fixture.driverTwoId;
    expect(accepted.driverId).toBe(winnerId);

    const cancelled = await api<RideOrder>(`/v1/orders/${order.data!.id}/cancel`, {
      method: 'POST',
      token: passengerToken,
    });
    expect(cancelled.status).toBe(200);
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT status FROM drivers WHERE id = ?',
      [winnerId],
    );
    expect(rows[0]?.status).toBe('online');
  }, 20_000);

  it('allows one current and one next order, promotes the next, and rejects a third', async () => {
    await setDriverStatus(driverOneToken, 'online');
    const [firstOrder, secondOrder, thirdOrder] = await Promise.all([
      createOrder(passengerToken),
      createOrder(outsiderToken),
      createOrder(driverTwoToken),
    ]);
    expect(firstOrder.status, JSON.stringify(firstOrder.error)).toBe(201);
    expect(secondOrder.status, JSON.stringify(secondOrder.error)).toBe(201);
    expect(thirdOrder.status, JSON.stringify(thirdOrder.error)).toBe(201);

    const firstAccepted = await api<RideOrder>(
      `/v1/driver/orders/${firstOrder.data!.id}/accept`,
      { method: 'POST', token: driverOneToken, body: {} },
    );
    expect(firstAccepted.status).toBe(200);
    expect(firstAccepted.data?.driverQueuePosition).toBe(1);

    const secondAccepted = await api<RideOrder>(
      `/v1/driver/orders/${secondOrder.data!.id}/accept`,
      { method: 'POST', token: driverOneToken, body: {} },
    );
    expect(secondAccepted.status).toBe(200);
    expect(secondAccepted.data?.driverQueuePosition).toBe(2);

    const queuedTransition = await api(
      `/v1/driver/orders/${secondOrder.data!.id}/transition`,
      {
        method: 'POST',
        token: driverOneToken,
        body: { status: 'driver_arriving' },
      },
    );
    expect(queuedTransition.status).toBe(409);
    expect(queuedTransition.error?.code).toBe('DRIVER_ORDER_QUEUED');

    const thirdAccepted = await api(
      `/v1/driver/orders/${thirdOrder.data!.id}/accept`,
      { method: 'POST', token: driverOneToken, body: {} },
    );
    expect(thirdAccepted.status).toBe(409);
    expect(thirdAccepted.error?.code).toBe('DRIVER_QUEUE_FULL');

    const offersAtCapacity = await api<RideOrder[]>('/v1/driver/offers', {
      token: driverOneToken,
    });
    expect(offersAtCapacity.status).toBe(200);
    expect(offersAtCapacity.data?.some((order) => order.id === thirdOrder.data!.id)).toBe(false);

    const queuedPassengerSocket = io(apiUrl, {
      auth: { token: outsiderToken },
      transports: ['websocket'],
      forceNew: true,
    });
    await socketEvent(queuedPassengerSocket, 'connect');
    const promotedRealtimeEvent = socketEvent<RideOrder>(
      queuedPassengerSocket,
      'order:updated',
    );
    const firstCancelled = await api(`/v1/orders/${firstOrder.data!.id}/cancel`, {
      method: 'POST', token: passengerToken,
    });
    expect(firstCancelled.status).toBe(200);
    const promotedRealtime = await promotedRealtimeEvent;
    queuedPassengerSocket.disconnect();
    expect(promotedRealtime.id).toBe(secondOrder.data!.id);
    expect(promotedRealtime.driverQueuePosition).toBe(1);

    const promoted = await api<RideOrder>(`/v1/orders/${secondOrder.data!.id}`, {
      token: outsiderToken,
    });
    expect(promoted.status).toBe(200);
    expect(promoted.data?.driverQueuePosition).toBe(1);

    await api(`/v1/orders/${secondOrder.data!.id}/cancel`, {
      method: 'POST', token: outsiderToken,
    });
    await api(`/v1/orders/${thirdOrder.data!.id}/cancel`, {
      method: 'POST', token: driverTwoToken,
    });
  }, 20_000);

  it('reopens a released order without offering it to the same driver again', async () => {
    await setDriverStatus(driverOneToken, 'online');
    await setDriverStatus(driverTwoToken, 'online');
    const order = await createOrder(passengerToken);
    expect(order.status).toBe(201);
    expect((await api(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST', token: driverOneToken, body: {},
    })).status).toBe(200);
    await api('/v1/driver/location', {
      method: 'PUT',
      token: driverOneToken,
      body: {
        latitude: pickup.coordinates.latitude,
        longitude: pickup.coordinates.longitude,
        accuracyMeters: 8,
      },
    });
    for (const status of ['driver_arriving', 'driver_waiting'] as const) {
      expect((await api(`/v1/driver/orders/${order.data!.id}/transition`, {
        method: 'POST',
        token: driverOneToken,
        body: { status },
      })).status).toBe(200);
    }
    expect((await api(`/v1/driver/orders/${order.data!.id}/waiting/start`, {
      method: 'POST', token: driverOneToken,
    })).status).toBe(200);
    await connection.execute(
      `UPDATE orders
       SET waiting_started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 270 SECOND)
       WHERE id = ?`,
      [order.data!.id],
    );
    const waitingStopped = await api<RideOrder>(
      `/v1/driver/orders/${order.data!.id}/waiting/stop`,
      { method: 'POST', token: driverOneToken },
    );
    expect(waitingStopped.data?.waitingPriceMinor).toBeGreaterThan(0);

    const released = await api<RideOrder>(`/v1/driver/orders/${order.data!.id}/release`, {
      method: 'POST',
      token: driverOneToken,
      body: { reason: 'Неисправность автомобиля' },
    });
    expect(released.status).toBe(200);
    expect(released.data?.status).toBe('searching');
    expect(released.data?.driverId).toBeUndefined();
    expect(released.data?.waitingSeconds).toBe(0);
    expect(released.data?.waitingPriceMinor).toBe(0);
    expect(released.data?.priceMinor).toBe(released.data?.basePriceMinor);

    const [sameDriverOffers, otherDriverOffers] = await Promise.all([
      api<RideOrder[]>('/v1/driver/offers', { token: driverOneToken }),
      api<RideOrder[]>('/v1/driver/offers', { token: driverTwoToken }),
    ]);
    expect(sameDriverOffers.data?.some((item) => item.id === order.data!.id)).toBe(false);
    expect(otherDriverOffers.data?.some((item) => item.id === order.data!.id)).toBe(true);
    await api(`/v1/orders/${order.data!.id}/cancel`, { method: 'POST', token: passengerToken });
  }, 20_000);

  it('does not let a dual-role driver accept their own passenger order', async () => {
    await setDriverStatus(driverOneToken, 'online');
    const order = await createOrder(driverOneToken);
    expect(order.status).toBe(201);

    const accepted = await api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST',
      token: driverOneToken,
      body: {},
    });

    expect(accepted.status).toBe(409);
    expect(accepted.error?.code).toBe('SELF_ACCEPT_FORBIDDEN');
    await api(`/v1/orders/${order.data!.id}/cancel`, {
      method: 'POST',
      token: driverOneToken,
    });
  }, 15_000);

  it('keeps passenger and driver order scopes separate for dual-role users', async () => {
    await setDriverStatus(driverOneToken, 'online');
    const order = await createOrder(passengerToken);
    expect(order.status).toBe(201);

    const accepted = await api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST',
      token: driverOneToken,
      body: {},
    });
    expect(accepted.status).toBe(200);

    const passengerOrders = await api<RideOrder[]>('/v1/orders?scope=passenger', {
      token: driverOneToken,
    });
    const driverOrders = await api<RideOrder[]>('/v1/orders?scope=driver', {
      token: driverOneToken,
    });

    expect(passengerOrders.status).toBe(200);
    expect(passengerOrders.data?.some((item) => item.id === order.data!.id)).toBe(false);
    expect(driverOrders.status).toBe(200);
    expect(driverOrders.data?.some((item) => item.id === order.data!.id)).toBe(true);

    await api(`/v1/orders/${order.data!.id}/cancel`, {
      method: 'POST',
      token: passengerToken,
    });
  }, 15_000);

  it('filters child orders and blocks a driver without a child seat', async () => {
    await setDriverStatus(driverOneToken, 'online');
    await setDriverStatus(driverTwoToken, 'online');
    const order = await createOrder(passengerToken, 'child');
    expect(order.status).toBe(201);

    const eligibleOffers = await api<RideOrder[]>('/v1/driver/offers', { token: driverOneToken });
    const ineligibleOffers = await api<RideOrder[]>('/v1/driver/offers', { token: driverTwoToken });
    expect(eligibleOffers.data?.some((item) => item.id === order.data!.id)).toBe(true);
    expect(ineligibleOffers.data?.some((item) => item.id === order.data!.id)).toBe(false);
    expect(
      (
        await api(`/v1/driver/orders/${order.data!.id}/accept`, {
          method: 'POST',
          token: driverTwoToken,
          body: {},
        })
      ).status,
    ).toBe(409);
    await api(`/v1/orders/${order.data!.id}/cancel`, { method: 'POST', token: passengerToken });
  }, 15_000);

  it('sends new-order socket offers only while a driver is online', async () => {
    expect((await setDriverStatus(driverOneToken, 'offline')).status).toBe(200);
    const driverSocket = io(apiUrl, {
      auth: { token: driverOneToken },
      transports: ['websocket'],
      forceNew: true,
    });
    let offersReceived = 0;
    driverSocket.on('order:available', () => {
      offersReceived += 1;
    });
    try {
      await socketEvent(driverSocket, 'connect');
      const hiddenOrder = await createOrder(passengerToken);
      expect(hiddenOrder.status).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(offersReceived).toBe(0);
      await api(`/v1/orders/${hiddenOrder.data!.id}/cancel`, {
        method: 'POST', token: passengerToken,
      });

      expect((await setDriverStatus(driverOneToken, 'online')).status).toBe(200);
      const availableEvent = socketEvent<RideOrder>(driverSocket, 'order:available');
      const visibleOrder = await createOrder(passengerToken);
      expect(visibleOrder.status).toBe(201);
      expect((await availableEvent).id).toBe(visibleOrder.data!.id);
      await api(`/v1/orders/${visibleOrder.data!.id}/cancel`, {
        method: 'POST', token: passengerToken,
      });
    } finally {
      driverSocket.disconnect();
    }
  }, 20_000);

  it('delivers order and location updates through authenticated sockets', async () => {
    await setDriverStatus(driverOneToken, 'online');
    const passengerSocket = io(apiUrl, {
      auth: { token: passengerToken },
      transports: ['websocket'],
      forceNew: true,
    });
    const driverSocket = io(apiUrl, {
      auth: { token: driverOneToken },
      transports: ['websocket'],
      forceNew: true,
    });
    const adminSocket = io(apiUrl, {
      auth: { token: adminToken },
      transports: ['websocket'],
      forceNew: true,
    });
    let driverLocationEvents = 0;
    let passengerLocationEvents = 0;
    passengerSocket.on('driver:location', () => {
      driverLocationEvents += 1;
    });
    driverSocket.on('passenger:location', (payload: { coordinates: unknown }) => {
      if (payload.coordinates) passengerLocationEvents += 1;
    });
    try {
      await Promise.all([
        socketEvent(passengerSocket, 'connect'),
        socketEvent(driverSocket, 'connect'),
        socketEvent(adminSocket, 'connect'),
      ]);
      const availableEvent = socketEvent<RideOrder>(driverSocket, 'order:available');
      const order = await createOrder(passengerToken);
      expect(order.status).toBe(201);
      const available = await availableEvent;
      expect(available.id).toBe(order.data!.id);
      const unavailableAdminChat = await api(
        `/v1/orders/${order.data!.id}/messages`,
        { token: adminToken },
      );
      expect(unavailableAdminChat.status).toBe(409);
      expect(unavailableAdminChat.error?.code).toBe('RIDE_CHAT_UNAVAILABLE');

      const acceptedEvent = socketEvent<RideOrder>(passengerSocket, 'order:updated');
      expect(
        (
          await api(`/v1/driver/orders/${order.data!.id}/accept`, {
            method: 'POST',
            token: driverOneToken,
            body: {},
          })
        ).status,
      ).toBe(200);
      const accepted = await acceptedEvent;
      expect(accepted.status).toBe('accepted');

      const driverChatEvent = socketEvent<RideChatMessage>(driverSocket, 'ride-chat:message');
      const adminChatEvent = socketEvent<RideChatMessage>(adminSocket, 'ride-chat:message');
      const passengerMessageId = randomUUID();
      const passengerMessage = await api<RideChatMessage>(
        `/v1/orders/${order.data!.id}/messages`,
        {
          method: 'POST',
          token: passengerToken,
          body: { id: passengerMessageId, body: 'Я у подъезда' },
        },
      );
      expect(passengerMessage.status).toBe(201);
      expect(passengerMessage.data?.sender.role).toBe('passenger');
      expect((await driverChatEvent).id).toBe(passengerMessageId);
      expect((await adminChatEvent).id).toBe(passengerMessageId);
      const driverBootstrapWithUnread = await api<{
        chatUnreadCounts: Record<string, number>;
      }>('/v1/bootstrap', { token: driverOneToken });
      expect(driverBootstrapWithUnread.data?.chatUnreadCounts[order.data!.id]).toBe(1);

      const driverReadEvent = socketEvent<{
        orderId: string;
        userId: string;
        unreadCount: number;
      }>(driverSocket, 'ride-chat:read');
      const driverRead = await api(`/v1/orders/${order.data!.id}/messages/read`, {
        method: 'POST',
        token: driverOneToken,
      });
      expect(driverRead.status).toBe(200);
      expect(await driverReadEvent).toMatchObject({
        orderId: order.data!.id,
        userId: fixture.driverUserOneId,
        unreadCount: 0,
      });
      const driverBootstrapAfterRead = await api<{
        chatUnreadCounts: Record<string, number>;
      }>('/v1/bootstrap', { token: driverOneToken });
      expect(driverBootstrapAfterRead.data?.chatUnreadCounts[order.data!.id]).toBeUndefined();

      const passengerChatEvent = socketEvent<RideChatMessage>(passengerSocket, 'ride-chat:message');
      const driverMessageId = randomUUID();
      const driverMessage = await api<RideChatMessage>(
        `/v1/orders/${order.data!.id}/messages`,
        {
          method: 'POST',
          token: driverOneToken,
          body: { id: driverMessageId, body: 'Подъехал, белая машина' },
        },
      );
      expect(driverMessage.status).toBe(201);
      expect(driverMessage.data?.sender.role).toBe('driver');
      expect((await passengerChatEvent).id).toBe(driverMessageId);
      const passengerBootstrapWithUnread = await api<{
        chatUnreadCounts: Record<string, number>;
      }>('/v1/bootstrap', { token: passengerToken });
      expect(passengerBootstrapWithUnread.data?.chatUnreadCounts[order.data!.id]).toBe(1);
      expect((await api(`/v1/orders/${order.data!.id}/messages/read`, {
        method: 'POST',
        token: outsiderToken,
      })).status).toBe(403);
      expect((await api(`/v1/orders/${order.data!.id}/messages/read`, {
        method: 'POST',
        token: adminToken,
      })).status).toBe(403);

      const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const driverPhotoEvent = socketEvent<RideChatMessage>(driverSocket, 'ride-chat:message');
      const adminPhotoEvent = socketEvent<RideChatMessage>(adminSocket, 'ride-chat:message');
      const passengerPhotoId = randomUUID();
      const passengerPhotoBody = {
        id: passengerPhotoId,
        body: '',
        attachment: {
          type: 'image',
          base64: onePixelPng,
          mimeType: 'image/png',
          width: 1,
          height: 1,
          fileName: 'pickup.png',
        },
      };
      const passengerPhoto = await api<RideChatMessage>(
        `/v1/orders/${order.data!.id}/messages`,
        {
          method: 'POST',
          token: passengerToken,
          body: passengerPhotoBody,
        },
      );
      expect(passengerPhoto.status).toBe(201);
      expect(passengerPhoto.data?.attachment).toMatchObject({
        type: 'image',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        fileName: 'pickup.png',
      });
      expect((await driverPhotoEvent).id).toBe(passengerPhotoId);
      expect((await adminPhotoEvent).id).toBe(passengerPhotoId);

      let duplicatePhotoEvents = 0;
      const countDuplicatePhoto = (message: RideChatMessage) => {
        if (message.id === passengerPhotoId) duplicatePhotoEvents += 1;
      };
      driverSocket.on('ride-chat:message', countDuplicatePhoto);
      const repeatedPhoto = await api<RideChatMessage>(
        `/v1/orders/${order.data!.id}/messages`,
        { method: 'POST', token: passengerToken, body: passengerPhotoBody },
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      driverSocket.off('ride-chat:message', countDuplicatePhoto);
      expect(repeatedPhoto.status).toBe(200);
      expect(repeatedPhoto.data?.id).toBe(passengerPhotoId);
      expect(duplicatePhotoEvents).toBe(0);

      const conflictingPhotoRetry = await api(
        `/v1/orders/${order.data!.id}/messages`,
        {
          method: 'POST',
          token: passengerToken,
          body: { ...passengerPhotoBody, body: 'Другой текст' },
        },
      );
      expect(conflictingPhotoRetry.status).toBe(409);
      expect(conflictingPhotoRetry.error?.code).toBe('RIDE_CHAT_MESSAGE_CONFLICT');

      const imageUrl = passengerPhoto.data?.attachment?.url;
      expect(imageUrl).toBeTruthy();
      const driverImage = await fetch(`${apiUrl}${imageUrl}`, {
        headers: { Authorization: `Bearer ${driverOneToken}` },
      });
      expect(driverImage.status).toBe(200);
      expect(driverImage.headers.get('content-type')).toContain('image/png');
      expect(driverImage.headers.get('cache-control')).toContain('no-store');
      expect(Buffer.from(await driverImage.arrayBuffer()).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect((await fetch(`${apiUrl}${imageUrl}`, {
        headers: { Authorization: `Bearer ${outsiderToken}` },
      })).status).toBe(403);
      expect((await fetch(`${apiUrl}${imageUrl}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })).status).toBe(200);
      expect((await fetch(`${apiUrl}${imageUrl}`)).status).toBe(401);

      const disguisedFile = await api(`/v1/orders/${order.data!.id}/messages`, {
        method: 'POST',
        token: passengerToken,
        body: {
          id: randomUUID(),
          body: '',
          attachment: {
            type: 'image',
            base64: Buffer.from('not an image').toString('base64'),
            mimeType: 'image/png',
          },
        },
      });
      expect(disguisedFile.status).toBe(400);
      expect(disguisedFile.error?.code).toBe('RIDE_CHAT_IMAGE_INVALID');

      const chatHistory = await api<RideChatThread>(
        `/v1/orders/${order.data!.id}/messages`,
        { token: passengerToken },
      );
      expect(chatHistory.status).toBe(200);
      expect(chatHistory.data?.counterpart?.role).toBe('driver');
      expect(chatHistory.data?.messages.map((item) => item.id)).toEqual([
        passengerMessageId,
        driverMessageId,
        passengerPhotoId,
      ]);
      expect(
        (await api(`/v1/orders/${order.data!.id}/messages`, { token: outsiderToken })).status,
      ).toBe(403);
      const adminChatHistory = await api<RideChatThread>(
        `/v1/orders/${order.data!.id}/messages`,
        { token: adminToken },
      );
      expect(adminChatHistory.status).toBe(200);
      expect(adminChatHistory.data?.viewerRole).toBe('admin');
      expect(adminChatHistory.data?.canSend).toBe(false);
      expect(adminChatHistory.data?.participants?.map((item) => item.role)).toEqual([
        'passenger',
        'driver',
      ]);
      expect(adminChatHistory.data?.messages.map((item) => item.id)).toEqual([
        passengerMessageId,
        driverMessageId,
        passengerPhotoId,
      ]);
      const adminSend = await api(`/v1/orders/${order.data!.id}/messages`, {
        method: 'POST',
        token: adminToken,
        body: { id: randomUUID(), body: 'Сообщение администратора' },
      });
      expect(adminSend.status).toBe(403);
      expect(adminSend.error?.code).toBe('ADMIN_RIDE_CHAT_READ_ONLY');

      const locationEvent = socketEvent<{ latitude: number; longitude: number }>(
        passengerSocket,
        'driver:location',
      );
      expect(
        (
          await api('/v1/driver/location', {
            method: 'PUT',
            token: driverOneToken,
            body: { latitude: 56.048, longitude: 51.959, accuracyMeters: 6 },
          })
        ).status,
      ).toBe(200);
      const location = await locationEvent;
      expect(location.latitude).toBeCloseTo(56.048);
      expect(location.longitude).toBeCloseTo(51.959);
      const driverLocationBurst = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          api<{ accepted: boolean; throttled?: boolean }>('/v1/driver/location', {
            method: 'PUT',
            token: driverOneToken,
            body: {
              latitude: 56.048 + index / 100_000,
              longitude: 51.959 + index / 100_000,
              accuracyMeters: 6,
            },
          }),
        ),
      );
      expect(driverLocationBurst.every((result) => result.status === 200)).toBe(true);
      expect(driverLocationBurst.every((result) => result.data?.throttled)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(driverLocationEvents).toBe(1);

      const passengerLocationEvent = socketEvent<{
        orderId: string;
        coordinates: { latitude: number; longitude: number } | null;
      }>(driverSocket, 'passenger:location');
      expect(
        (
          await api('/v1/passenger/location', {
            method: 'PUT',
            token: passengerToken,
            body: {
              orderId: order.data!.id,
              latitude: 56.0479,
              longitude: 51.9588,
              accuracyMeters: 7,
            },
          })
        ).status,
      ).toBe(200);
      const passengerLocation = await passengerLocationEvent;
      expect(passengerLocation.orderId).toBe(order.data!.id);
      expect(passengerLocation.coordinates?.latitude).toBeCloseTo(56.0479);
      const passengerLocationBurst = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          api<{ accepted: boolean; throttled?: boolean }>('/v1/passenger/location', {
            method: 'PUT',
            token: passengerToken,
            body: {
              orderId: order.data!.id,
              latitude: 56.0479 + index / 100_000,
              longitude: 51.9588 + index / 100_000,
              accuracyMeters: 7,
            },
          }),
        ),
      );
      expect(passengerLocationBurst.every((result) => result.status === 200)).toBe(true);
      expect(passengerLocationBurst.every((result) => result.data?.throttled)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(passengerLocationEvents).toBe(1);
      expect(
        (
          await api('/v1/passenger/location', {
            method: 'PUT',
            token: outsiderToken,
            body: {
              orderId: order.data!.id,
              latitude: 56.0479,
              longitude: 51.9588,
            },
          })
        ).status,
      ).toBe(403);
      const removedLocationEvent = socketEvent<{
        orderId: string;
        coordinates: null;
      }>(driverSocket, 'passenger:location');
      expect(
        (
          await api(`/v1/passenger/location/${order.data!.id}`, {
            method: 'DELETE',
            token: passengerToken,
          })
        ).status,
      ).toBe(200);
      expect((await removedLocationEvent).coordinates).toBeNull();
      await api(`/v1/orders/${order.data!.id}/cancel`, {
        method: 'POST',
        token: passengerToken,
      });
      expect(
        (
          await api(`/v1/orders/${order.data!.id}/messages`, {
            method: 'POST',
            token: driverOneToken,
            body: { id: randomUUID(), body: 'Позднее сообщение' },
          })
        ).status,
      ).toBe(409);
      const terminalAdminChat = await api<RideChatThread>(
        `/v1/orders/${order.data!.id}/messages`,
        { token: adminToken },
      );
      expect(terminalAdminChat.status).toBe(200);
      expect(terminalAdminChat.data?.orderStatus).toBe('cancelled');
      expect(terminalAdminChat.data?.canSend).toBe(false);
      expect(terminalAdminChat.data?.messages.map((item) => item.id)).toEqual([
        passengerMessageId,
        driverMessageId,
        passengerPhotoId,
      ]);
    } finally {
      passengerSocket.disconnect();
      driverSocket.disconnect();
      adminSocket.disconnect();
    }
  }, 15_000);

  it('runs the full driver lifecycle, location updates and earnings', async () => {
    await setDriverStatus(driverOneToken, 'online');
    expect(
      (
        await api('/v1/driver/location', {
          method: 'PUT',
          token: driverOneToken,
          body: { latitude: 56.0475, longitude: 51.9584, accuracyMeters: 8 },
        })
      ).status,
    ).toBe(200);
    const order = await createOrder(passengerToken);
    const accepted = await api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST',
      token: driverOneToken,
      body: {},
    });
    expect(accepted.status).toBe(200);
    const pickupRoute = await api<{
      distanceMeters: number;
      durationSeconds: number;
      target: 'pickup' | 'destination';
    }>(`/v1/driver/orders/${order.data!.id}/route`, {
      method: 'POST',
      token: driverOneToken,
      body: { latitude: 56.0475, longitude: 51.9584 },
    });
    expect(pickupRoute.status).toBe(200);
    expect(pickupRoute.data?.target).toBe('pickup');
    expect(pickupRoute.data?.distanceMeters).toBeGreaterThan(0);
    const endBusyShift = await setDriverStatus(driverOneToken, 'offline');
    expect(endBusyShift.status).toBe(409);
    expect(endBusyShift.error?.code).toBe('ACTIVE_RIDE_IN_PROGRESS');

    const invalid = await api(`/v1/driver/orders/${order.data!.id}/transition`, {
      method: 'POST',
      token: driverOneToken,
      body: { status: 'completed' },
    });
    expect(invalid.status).toBe(409);
    expect(invalid.error?.code).toBe('INVALID_STATUS_TRANSITION');

    for (const status of ['driver_arriving', 'driver_waiting', 'in_progress', 'completed'] as const) {
      if (status === 'completed') {
        const withoutPaymentConfirmation = await api(
          `/v1/driver/orders/${order.data!.id}/transition`,
          {
            method: 'POST',
            token: driverOneToken,
            body: { status },
          },
        );
        expect(withoutPaymentConfirmation.status).toBe(409);
        expect(withoutPaymentConfirmation.error?.code).toBe('PAYMENT_CONFIRMATION_REQUIRED');
      }
      const transitioned = await api<RideOrder>(
        `/v1/driver/orders/${order.data!.id}/transition`,
        {
          method: 'POST',
          token: driverOneToken,
          body: { status, ...(status === 'completed' ? { paymentReceived: true } : {}) },
        },
      );
      expect(transitioned.status).toBe(200);
      expect(transitioned.data?.status).toBe(status);
      if (status === 'driver_waiting') {
        const waitingStarted = await api<RideOrder>(
          `/v1/driver/orders/${order.data!.id}/waiting/start`,
          { method: 'POST', token: driverOneToken },
        );
        expect(waitingStarted.status).toBe(200);
        expect(waitingStarted.data?.waitingStartedAt).toBeTruthy();
        await connection.execute(
          `UPDATE orders
           SET waiting_started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 270 SECOND)
           WHERE id = ?`,
          [order.data!.id],
        );
        const waitingStopped = await api<RideOrder>(
          `/v1/driver/orders/${order.data!.id}/waiting/stop`,
          { method: 'POST', token: driverOneToken },
        );
        expect(waitingStopped.status).toBe(200);
        expect(waitingStopped.data?.waitingStartedAt).toBeUndefined();
        expect(waitingStopped.data?.waitingSeconds).toBeGreaterThanOrEqual(270);
        expect(waitingStopped.data?.waitingPriceMinor).toBe(800);
        expect(waitingStopped.data?.priceMinor).toBe(
          (waitingStopped.data?.basePriceMinor ?? 0) + 800,
        );
      }
      if (status === 'in_progress') {
        const destinationRoute = await api<{
          target: 'pickup' | 'destination';
        }>(`/v1/driver/orders/${order.data!.id}/route`, {
          method: 'POST',
          token: driverOneToken,
          body: { latitude: 56.0475, longitude: 51.9584 },
        });
        expect(destinationRoute.status).toBe(200);
        expect(destinationRoute.data?.target).toBe('destination');
        expect(
          (
            await api(`/v1/orders/${order.data!.id}/cancel`, {
              method: 'POST',
              token: passengerToken,
            })
          ).status,
        ).toBe(409);
      }
    }

    const outsiderRating = await api(`/v1/orders/${order.data!.id}/rating`, {
      method: 'POST',
      token: outsiderToken,
      body: { score: 1 },
    });
    expect(outsiderRating.status).toBe(403);
    expect(outsiderRating.error?.code).toBe('RATING_FORBIDDEN');

    const passengerRating = await api<RideOrder>(`/v1/orders/${order.data!.id}/rating`, {
      method: 'POST',
      token: passengerToken,
      body: { score: 5 },
    });
    expect(passengerRating.status).toBe(200);
    expect(passengerRating.data?.ratings?.byPassenger).toBe(5);
    expect(passengerRating.data?.driver?.rating).toBe(5);
    expect(passengerRating.data?.driver?.ratingCount).toBe(1);

    const duplicateRating = await api(`/v1/orders/${order.data!.id}/rating`, {
      method: 'POST',
      token: passengerToken,
      body: { score: 4 },
    });
    expect(duplicateRating.status).toBe(409);
    expect(duplicateRating.error?.code).toBe('RATING_ALREADY_SUBMITTED');

    const driverRating = await api<RideOrder>(`/v1/orders/${order.data!.id}/rating`, {
      method: 'POST',
      token: driverOneToken,
      body: { score: 4 },
    });
    expect(driverRating.status).toBe(200);
    expect(driverRating.data?.ratings).toEqual({ byDriver: 4 });
    expect(driverRating.data?.passenger?.rating).toBe(4);
    expect(driverRating.data?.passenger?.ratingCount).toBe(1);

    const passengerOrderAfterRatings = await api<RideOrder>(
      `/v1/orders/${order.data!.id}`,
      { token: passengerToken },
    );
    const driverOrderAfterRatings = await api<RideOrder>(
      `/v1/orders/${order.data!.id}`,
      { token: driverOneToken },
    );
    expect(passengerOrderAfterRatings.data?.ratings).toEqual({ byPassenger: 5 });
    expect(driverOrderAfterRatings.data?.ratings).toEqual({ byDriver: 4 });

    const passengerDetail = await api<AdminPassengerDetail>(
      `/v1/admin/passengers/${fixture.passengerId}`,
      { token: adminToken },
    );
    const receivedRating = passengerDetail.data?.ratings.find(
      (rating) => rating.raterRole === 'driver' && rating.orderId === order.data!.id,
    );
    expect(receivedRating).toBeTruthy();
    expect(
      (
        await api(`/v1/admin/ratings/${receivedRating!.id}`, {
          method: 'DELETE',
          token: adminToken,
        })
      ).status,
    ).toBe(200);
    const passengerAfterDeletion = await api<AdminPassengerDetail>(
      `/v1/admin/passengers/${fixture.passengerId}`,
      { token: adminToken },
    );
    expect(passengerAfterDeletion.data?.stats.ratingCount).toBe(0);
    expect(passengerAfterDeletion.data?.stats.rating).toBe(5);

    await connection.execute(
      `UPDATE driver_shifts SET started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 20 MINUTE)
       WHERE driver_id = ? AND ended_at IS NULL`,
      [fixture.driverOneId],
    );
    const earnings = await api<{
      grossMinor: number;
      commissionMinor: number;
      netMinor: number;
      rides: number;
      onlineMinutes: number;
    }>('/v1/driver/earnings?period=today', { token: driverOneToken });
    expect(earnings.status).toBe(200);
    expect(earnings.data?.rides).toBeGreaterThanOrEqual(1);
    expect(earnings.data?.grossMinor).toBeGreaterThan(0);
    expect(earnings.data?.onlineMinutes).toBeGreaterThanOrEqual(19);
    expect(earnings.data?.netMinor).toBe(
      (earnings.data?.grossMinor ?? 0) - (earnings.data?.commissionMinor ?? 0),
    );
  }, 20_000);

  it('applies individual driver commission without rewriting completed orders', async () => {
    const updated = await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'online', commissionBps: 500 },
    });
    expect(updated.status).toBe(200);
    const order = await createOrder(passengerToken);
    const accepted = await api<RideOrder>(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST',
      token: driverOneToken,
      body: {},
    });
    expect(accepted.status).toBe(200);
    expect(accepted.data?.serviceCommissionMinor).toBe(
      Math.round((accepted.data?.priceMinor ?? 0) * 0.05),
    );
    await api(`/v1/orders/${order.data!.id}/cancel`, { method: 'POST', token: passengerToken });
    await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { commissionBps: null },
    });
  }, 15_000);

  it('blocks administrative suspension until the active ride completes', async () => {
    await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'online' },
    });
    const order = await createOrder(passengerToken);
    expect(
      (
        await api(`/v1/driver/orders/${order.data!.id}/accept`, {
          method: 'POST',
          token: driverOneToken,
          body: {},
        })
      ).status,
    ).toBe(200);
    const activeSuspension = await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'suspended' },
    });
    expect(activeSuspension.status).toBe(409);
    expect(activeSuspension.error?.code).toBe('ACTIVE_RIDE_IN_PROGRESS');
    await api('/v1/driver/location', {
      method: 'PUT',
      token: driverOneToken,
      body: { latitude: pickup.coordinates.latitude, longitude: pickup.coordinates.longitude, accuracyMeters: 8 },
    });
    for (const status of ['driver_arriving', 'driver_waiting', 'in_progress', 'completed'] as const) {
      expect(
        (
          await api(`/v1/driver/orders/${order.data!.id}/transition`, {
            method: 'POST',
            token: driverOneToken,
            body: { status, ...(status === 'completed' ? { paymentReceived: true } : {}) },
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
          method: 'PATCH',
          token: adminToken,
          body: { status: 'suspended' },
        })
      ).status,
    ).toBe(200);
    const [drivers] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT status FROM drivers WHERE id = ?',
      [fixture.driverOneId],
    );
    expect(drivers[0]?.status).toBe('suspended');
    await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'offline' },
    });
  }, 15_000);

  it('keeps the current vehicle active until an admin approves a change request', async () => {
    const created = await api<VehicleChangeRequest>('/v1/driver/vehicle-change-requests', {
      method: 'POST',
      token: driverOneToken,
      body: {
        vehicleMake: 'Lada',
        vehicleModel: 'Vesta',
        vehicleYear: 2024,
        vehicleColor: 'Красная',
        vehicleColorHex: '#D64545',
        plate: `Н${fixture.vehicleOneId.slice(0, 6).toUpperCase()}`,
        hasChildSeat: false,
      },
    });
    expect(created.status).toBe(201);
    expect(created.data?.status).toBe('pending');
    expect(created.data?.currentVehicle.model).toBe('Granta');
    expect(created.data?.proposedVehicle.colorHex).toBe('#D64545');

    const [beforeApproval] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT model, color_hex FROM vehicles WHERE id = ? AND active = TRUE',
      [fixture.vehicleOneId],
    );
    expect(beforeApproval[0]?.model).toBe('Granta');
    expect(beforeApproval[0]?.color_hex).toBe('#F7F7F2');

    const duplicate = await api('/v1/driver/vehicle-change-requests', {
      method: 'POST',
      token: driverOneToken,
      body: {
        vehicleMake: 'Lada',
        vehicleModel: 'Vesta',
        vehicleYear: 2024,
        vehicleColor: 'Красная',
        vehicleColorHex: '#D64545',
        plate: `Н${fixture.vehicleOneId.slice(0, 6).toUpperCase()}`,
        hasChildSeat: false,
      },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.error?.code).toBe('PENDING_VEHICLE_CHANGE_EXISTS');

    const mine = await api<VehicleChangeRequest[]>('/v1/driver/vehicle-change-requests/me', {
      token: driverOneToken,
    });
    expect(mine.data?.some((item) => item.id === created.data!.id)).toBe(true);
    const adminList = await api<VehicleChangeRequest[]>('/v1/admin/vehicle-change-requests', {
      token: adminToken,
    });
    expect(adminList.data?.some((item) => item.id === created.data!.id)).toBe(true);

    const approved = await api(
      `/v1/admin/vehicle-change-requests/${created.data!.id}/moderate`,
      {
        method: 'POST',
        token: adminToken,
        body: { decision: 'approved', comment: 'Автомобиль проверен' },
      },
    );
    expect(approved.status).toBe(200);

    const profile = await api<{
      model: string;
      color: string;
      colorHex: string;
      hasChildSeat: boolean;
    }>('/v1/driver/profile', { token: driverOneToken });
    expect(profile.data).toMatchObject({
      model: 'Vesta',
      color: 'Красная',
      colorHex: '#D64545',
      hasChildSeat: false,
    });
    const [vehicles] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT model, active FROM vehicles WHERE driver_id = ? ORDER BY created_at',
      [fixture.driverOneId],
    );
    expect(vehicles.some((vehicle) => vehicle.model === 'Granta' && !Boolean(vehicle.active))).toBe(true);
    expect(vehicles.some((vehicle) => vehicle.model === 'Vesta' && Boolean(vehicle.active))).toBe(true);
  });

  it('submits and moderates a driver application atomically', async () => {
    const application = await api<{ id: string; status: string }>('/v1/driver-applications', {
      method: 'POST',
      token: applicantToken,
      body: {
        applicantName: 'Кандидат в водители',
        phone: '+7 900 000-00-05',
        licenseNumber: '18 22 654321',
        vehicleMake: 'Lada',
        vehicleModel: 'Vesta',
        vehicleYear: 2022,
        vehicleColor: 'Синий',
        vehicleColorHex: '#2F6FED',
        plate: `К${fixture.applicantId.slice(0, 6).toUpperCase()}`,
        hasChildSeat: true,
        legalAcceptance: currentDriverLegalAcceptance(),
      },
    });
    expect(application.status).toBe(201);
    expect(application.data?.status).toBe('pending');
    const duplicate = await api('/v1/driver-applications', {
      method: 'POST',
      token: applicantToken,
      body: {
        applicantName: 'Кандидат в водители',
        phone: '+7 900 000-00-05',
        licenseNumber: '18 22 654321',
        vehicleMake: 'Lada',
        vehicleModel: 'Vesta',
        vehicleYear: 2022,
        vehicleColor: 'Синий',
        vehicleColorHex: '#2F6FED',
        plate: `К${fixture.applicantId.slice(0, 6).toUpperCase()}`,
        hasChildSeat: true,
        legalAcceptance: currentDriverLegalAcceptance(),
      },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.error?.code).toBe('PENDING_APPLICATION_EXISTS');
    const own = await api<{ id: string }[]>('/v1/driver-applications/me', {
      token: applicantToken,
    });
    expect(own.data?.some((item) => item.id === application.data!.id)).toBe(true);
    const adminList = await api<{ id: string }[]>('/v1/admin/applications', {
      token: adminToken,
    });
    expect(adminList.data?.some((item) => item.id === application.data!.id)).toBe(true);

    const moderated = await api(`/v1/admin/applications/${application.data!.id}/moderate`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'approved', comment: 'Документы проверены' },
    });
    expect(moderated.status).toBe(200);
    expect(
      (
        await api(`/v1/admin/applications/${application.data!.id}/moderate`, {
          method: 'POST',
          token: adminToken,
          body: { decision: 'approved' },
        })
      ).status,
    ).toBe(409);

    const [drivers] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT d.id, d.status, d.has_child_seat, v.plate
       FROM drivers d JOIN vehicles v ON v.driver_id = d.id AND v.active = TRUE
       WHERE d.user_id = ?`,
      [fixture.applicantId],
    );
    expect(drivers).toHaveLength(1);
    expect(drivers[0]?.status).toBe('online');
    expect(Boolean(drivers[0]?.has_child_seat)).toBe(true);
    const [openShifts] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT id FROM driver_shifts WHERE driver_id = ? AND ended_at IS NULL',
      [drivers[0]!.id],
    );
    expect(openShifts).toHaveLength(1);
    const [roles] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT role FROM user_roles WHERE user_id = ? AND role = 'driver'",
      [fixture.applicantId],
    );
    expect(roles).toHaveLength(1);
    const refreshed = await api<{ token: string; user: { roles: string[] } }>('/v1/auth/refresh', {
      method: 'POST',
      token: applicantToken,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.data?.user.roles).toContain('driver');
    expect(
      (await api('/v1/driver/profile', { token: refreshed.data!.token })).status,
    ).toBe(200);
  });

  it('configures independent driver priorities and notification delays by zone', async () => {
    const settings = { grahovo: 2, district: 3, intercity: 4 };
    const updatedSettings = await api<Record<string, number>>(
      '/v1/admin/driver-dispatch-settings',
      { method: 'PUT', token: adminToken, body: settings },
    );
    expect(updatedSettings.status).toBe(200);
    expect(updatedSettings.data).toEqual(settings);
    expect(
      (await api('/v1/admin/driver-dispatch-settings', { token: passengerToken })).status,
    ).toBe(403);

    const priorities = { grahovo: true, district: false, intercity: true };
    const updatedDriver = await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { priorities },
    });
    expect(updatedDriver.status).toBe(200);
    const detail = await api<AdminDriverDetail>(
      `/v1/admin/drivers/${fixture.driverOneId}`,
      { token: adminToken },
    );
    expect(detail.data?.driver.priorities).toEqual(priorities);
    const [assignments] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT scope FROM driver_priority_assignments
       WHERE driver_id = ? ORDER BY scope`,
      [fixture.driverOneId],
    );
    expect(assignments.map((row) => row.scope)).toEqual(['grahovo', 'intercity']);

    await setDriverStatus(driverOneToken, 'online');
    await setDriverStatus(driverTwoToken, 'online');
    const order = await createOrder(passengerToken);
    expect(order.status, JSON.stringify(order.error)).toBe(201);
    const priorityOffers = await api<RideOrder[]>('/v1/driver/offers', {
      token: driverOneToken,
    });
    const regularOffers = await api<RideOrder[]>('/v1/driver/offers', {
      token: driverTwoToken,
    });
    expect(priorityOffers.data?.some((item) => item.id === order.data?.id)).toBe(true);
    expect(regularOffers.data?.some((item) => item.id === order.data?.id)).toBe(false);
    const earlyAcceptance = await api(`/v1/driver/orders/${order.data!.id}/accept`, {
      method: 'POST',
      token: driverTwoToken,
    });
    expect(earlyAcceptance.status).toBe(403);
    expect(earlyAcceptance.error?.code).toBe('ORDER_PRIORITY_DELAY');

    await connection.execute(
      `UPDATE orders SET priority_release_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)
       WHERE id = ?`,
      [order.data!.id],
    );
    const releasedOffers = await api<RideOrder[]>('/v1/driver/offers', {
      token: driverTwoToken,
    });
    expect(releasedOffers.data?.some((item) => item.id === order.data?.id)).toBe(true);
    await api(`/v1/orders/${order.data!.id}/cancel`, {
      method: 'POST',
      token: passengerToken,
    });

    await api('/v1/admin/driver-dispatch-settings', {
      method: 'PUT',
      token: adminToken,
      body: { grahovo: 1, district: 1, intercity: 1 },
    });
    await api(`/v1/admin/drivers/${fixture.driverOneId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { priorities: { grahovo: false, district: false, intercity: false } },
    });
  });

  it('updates tariffs, metrics, driver suspension and audit records', async () => {
    const changedTariffs = {
      grahovoFare07To22Minor: originalTariffs.grahovoFare07To22Minor + 100,
      grahovoFare22To02Minor: originalTariffs.grahovoFare22To02Minor,
      grahovoFare02To07Minor: originalTariffs.grahovoFare02To07Minor,
      districtPerKilometer07To22Minor: originalTariffs.districtPerKilometer07To22Minor,
      districtPerKilometer22To02Minor: originalTariffs.districtPerKilometer22To02Minor,
      districtPerKilometer02To07Minor: originalTariffs.districtPerKilometer02To07Minor,
      intercityPerKilometerMinor: originalTariffs.intercityPerKilometerMinor,
      childSurchargeMinor: originalTariffs.childSurchargeMinor,
      additionalStopGrahovoSurchargeBps:
        originalTariffs.additionalStopGrahovoSurchargeBps,
      waitingFreeMinutes: originalTariffs.waitingFreeMinutes,
      waitingPerMinuteMinor: originalTariffs.waitingPerMinuteMinor,
      searchPriceIncreaseIntervalMinutes:
        originalTariffs.searchPriceIncreaseIntervalMinutes,
      searchPriceIncreaseStepMinor: originalTariffs.searchPriceIncreaseStepMinor,
      serviceCommissionBps: 900,
      passengerCancellationLimit: 4,
      passengerCancellationWindowHours: 48,
      passengerCancellationBlockHours: 12,
    };
    expect(
      (
        await api('/v1/admin/tariffs', {
          method: 'PUT',
          token: adminToken,
          body: changedTariffs,
        })
      ).status,
    ).toBe(200);
    const readBack = await api<Record<string, number>>('/v1/admin/tariffs', {
      token: adminToken,
    });
    expect(readBack.data?.serviceCommissionBps).toBe(900);
    expect(readBack.data?.passengerCancellationLimit).toBe(4);
    expect(readBack.data?.passengerCancellationWindowHours).toBe(48);
    expect(readBack.data?.passengerCancellationBlockHours).toBe(12);
    expect((await api('/v1/admin/metrics', { token: adminToken })).status).toBe(200);
    expect((await api('/v1/admin/drivers', { token: adminToken })).status).toBe(200);
    expect((await api('/v1/orders', { token: adminToken })).status).toBe(200);

    await api(`/v1/admin/drivers/${fixture.driverTwoId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'suspended' },
    });
    expect((await setDriverStatus(driverTwoToken, 'online')).status).toBe(403);

    const [audits] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT action FROM audit_logs
       WHERE actor_user_id = ? AND action IN ('driver.update', 'tariffs.update')`,
      [fixture.adminId],
    );
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });
});
