import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import {
  calculateCommissionMinor,
  calculateFareMinor,
  calculateWaitingChargeMinor,
  classifyPricingScope,
  farePeriodAt,
  farePeriodLabel,
  type PricingRules,
  type PricingScope,
} from '../src/domain/pricing';
import { hasHouseNumber } from '../src/domain/address-precision';
import { passengerCancellationPolicy } from '../src/domain/abuse-policy';
import {
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
  liveLocationUpdateDelay,
} from '../src/domain/live-location';
import { canTransitionRide, driverRouteTarget } from '../src/domain/ride-state';
import type { RideStatus, TariffCode, UserRole } from '../src/domain/models';
import { formatRetryAfter } from '../src/utils/format';
import {
  buildAuthIdentity,
  consumeAuthRateLimits,
  createAuthAttempt,
  finishAuthAttempt,
  refundAuthRateLimits,
} from './auth-abuse';
import {
  formatMoney,
  sendAdminTelegramAction,
  type AdminTelegramAction,
} from './admin-telegram';
import { config } from './config';
import { sendCriticalErrorReport } from './critical-telegram';
import { db, firstRow, withTransaction } from './db';
import { searchAddresses } from './geocoding';
import {
  driverLegalAcceptanceSchema,
  hasCurrentInitialConsents,
  initialLegalAcceptanceSchema,
  recordDriverConsents,
  recordInitialConsents,
} from './legal';
import {
  extractPhoneFromMaxVcf,
  requestMaxContact,
  sendMaxConfirmation,
  verifyMaxContact,
} from './max-bot';
import {
  appUrl,
  notifyDriversInMessengers,
  notifyOnlineDriversInMessengers,
  notifyUsersInMessengers,
  type PersonalMessengerNotification,
} from './messenger-notifications';
import { orderSelect, presentOrder, type OrderRow } from './presenters';
import {
  deviceFingerprint,
  hashesMatch,
  maskPhone,
  normalizeRussianPhone,
  phoneCodeHash,
} from './phone-verification';
import { isPlayReviewPhone, PLAY_REVIEW_CODE } from './play-review-auth';
import { notifyOnlineDrivers, notifyUsers } from './push';
import {
  findOrCreatePhoneUser,
  findUserWithRoles,
  linkMessengerIdentity,
} from './repositories';
import { getRouteMetrics, type RouteMetrics } from './routing';
import {
  authenticate,
  randomToken,
  requireRole,
  sha256,
  signSession,
  type AuthUser,
} from './security';
import { sendPhoneVerificationCode, verifyPhoneVerificationCode } from './sms';
import { processTelegramUpdate, telegramUpdateSchema } from './telegram-updates';

type EventPublisher = (room: string, event: string, payload: unknown) => void;

const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const passengerLocationSchema = pointSchema.extend({
  orderId: z.string().uuid(),
  accuracyMeters: z.number().min(0).max(10_000).optional(),
});
const addressSchema = z
  .object({
    id: z.string().max(80).default('address'),
    label: z.string().trim().min(2).max(255),
    details: z.string().trim().max(255).optional(),
    houseNumber: z.string().trim().min(1).max(24).optional(),
    coordinates: pointSchema,
  })
  .refine(hasHouseNumber, {
    message: 'Укажите адрес с номером дома',
    path: ['label'],
  });
const tariffSchema = z.enum(['economy', 'child']);
const tariffLabels: Record<TariffCode, string> = {
  economy: 'Эконом',
  child: 'Детский',
};
const paymentMethodLabels = {
  direct: 'напрямую',
  cash: 'наличные',
  transfer: 'перевод',
} as const;
const rideStatusLabels: Record<RideStatus, string> = {
  draft: 'черновик',
  searching: 'поиск водителя',
  accepted: 'заказ принят',
  driver_arriving: 'водитель едет к пассажиру',
  driver_waiting: 'водитель на месте',
  in_progress: 'поездка началась',
  completed: 'поездка завершена',
  cancelled: 'заказ отменён',
};
const quoteSchema = z.object({ pickup: addressSchema, destination: addressSchema });
const createOrderSchema = quoteSchema.extend({
  tariff: tariffSchema,
  paymentMethod: z.enum(['direct', 'cash', 'transfer']).default('direct'),
  comment: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(12).max(128),
  deviceId: z.string().min(16).max(128),
});
const requestPhoneCodeSchema = z.object({
  phone: z.string().trim().min(10).max(32),
  installationId: z.string().trim().min(16).max(128),
});
const verifyPhoneCodeSchema = requestPhoneCodeSchema.extend({
  code: z.string().regex(/^\d{4}$/u),
});
const phoneAuthStartSchema = requestPhoneCodeSchema.extend({
  legalAcceptance: initialLegalAcceptanceSchema,
});
const phoneAuthVerifySchema = verifyPhoneCodeSchema;
const maxAuthStatusSchema = z.object({
  challengeId: z.string().uuid(),
  exchangeToken: z.string().min(32).max(128),
  installationId: z.string().trim().min(16).max(128),
});
const maxUpdateSchema = z.object({
  update_type: z.string(),
  chat_id: z.union([z.string(), z.number()]).optional(),
  payload: z.string().nullable().optional(),
  user: z.object({
    user_id: z.union([z.string(), z.number()]),
    name: z.string().trim().max(160).nullish(),
    username: z.string().trim().max(64).nullish(),
  }).passthrough().optional(),
  message: z.object({
    sender: z.object({ user_id: z.union([z.string(), z.number()]) }).passthrough().optional(),
    body: z.object({ attachments: z.array(z.unknown()).optional() }).passthrough().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();
const clientErrorSchema = z.object({
  source: z.enum([
    'react-error-boundary',
    'global-error',
    'unhandled-rejection',
    'resource-error',
  ]),
  name: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2_000),
  stack: z.string().trim().max(12_000).optional(),
  route: z.string().trim().max(500).optional(),
  platform: z.enum(['android', 'ios', 'web', 'windows', 'macos', 'unknown']),
  appVersion: z.string().trim().max(80).optional(),
  fatal: z.boolean().optional(),
  filename: z.string().trim().max(1_000).optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  resource: z.string().trim().max(1_000).optional(),
  online: z.boolean().optional(),
  visibilityState: z.enum(['hidden', 'visible', 'prerender', 'unloaded']).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
const profileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  gender: z.enum(['male', 'female']),
});
const avatarSchema = z.object({
  base64: z.string().min(16).max(3_500_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

function decodeAvatar(input: z.infer<typeof avatarSchema>): Buffer {
  const bytes = Buffer.from(input.base64, 'base64');
  if (!bytes.length || bytes.length > 2_500_000) {
    throw Object.assign(new Error('Аватар должен быть не больше 2,5 МБ'), {
      statusCode: 413,
      code: 'AVATAR_TOO_LARGE',
    });
  }
  const validMagic =
    (input.mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (input.mimeType === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (input.mimeType === 'image/webp' &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!validMagic) {
    throw Object.assign(new Error('Выбранный файл не похож на изображение'), {
      statusCode: 400,
      code: 'AVATAR_INVALID',
    });
  }
  return bytes;
}
const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
});
const vehicleDetailsSchema = z.object({
  vehicleMake: z.string().trim().min(2).max(80),
  vehicleModel: z.string().trim().min(1).max(80),
  vehicleYear: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  vehicleColor: z.string().trim().min(2).max(64),
  vehicleColorHex: z.string().regex(/^#[0-9A-F]{6}$/i, 'Некорректный цвет автомобиля'),
  plate: z.string().trim().min(5).max(24),
  hasChildSeat: z.boolean().default(false),
});
const applicationSchema = vehicleDetailsSchema.extend({
  applicantName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(10).max(32),
  licenseNumber: z.string().trim().min(4).max(64),
  legalAcceptance: driverLegalAcceptanceSchema,
});

type VehicleChangeRow = RowDataPacket & {
  id: string;
  driver_id: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_color: string;
  vehicle_color_hex: string;
  plate: string;
  has_child_seat: number;
  status: 'pending' | 'approved' | 'rejected';
  moderation_comment: string | null;
  created_at: Date | string;
  current_make: string;
  current_model: string;
  current_year: number;
  current_color: string;
  current_color_hex: string;
  current_plate: string;
  current_has_child_seat: number;
  driver_name?: string;
};

const vehicleChangeSelect = `
  SELECT r.*, v.make AS current_make, v.model AS current_model,
    v.year AS current_year, v.color AS current_color,
    v.color_hex AS current_color_hex, v.plate AS current_plate,
    d.has_child_seat AS current_has_child_seat, u.name AS driver_name
  FROM vehicle_change_requests r
  JOIN vehicles v ON v.id = r.current_vehicle_id
  JOIN drivers d ON d.id = r.driver_id
  JOIN users u ON u.id = d.user_id
`;

function presentVehicleChangeRequest(row: VehicleChangeRow) {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    currentVehicle: {
      make: row.current_make,
      model: row.current_model,
      year: Number(row.current_year),
      color: row.current_color,
      colorHex: row.current_color_hex,
      plate: row.current_plate,
    },
    proposedVehicle: {
      make: row.vehicle_make,
      model: row.vehicle_model,
      year: Number(row.vehicle_year),
      color: row.vehicle_color,
      colorHex: row.vehicle_color_hex,
      plate: row.plate,
    },
    currentHasChildSeat: Boolean(row.current_has_child_seat),
    hasChildSeat: Boolean(row.has_child_seat),
    status: row.status,
    moderationComment: row.moderation_comment ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw Object.assign(new Error('Проверьте заполненные данные'), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: z.flattenError(result.error),
    });
  }
  return result.data;
}

async function auth(request: FastifyRequest, role?: UserRole): Promise<AuthUser> {
  const user = await authenticate(request);
  if (role) requireRole(user, role);
  return user;
}

type PricingRow = RowDataPacket & {
  fare_07_22_minor: number;
  fare_22_02_minor: number;
  fare_02_07_minor: number;
  child_surcharge_minor: number;
  waiting_free_minutes: number;
  waiting_per_minute_minor: number;
  service_commission_bps: number;
};

async function pricingRules(connection?: PoolConnection): Promise<PricingRules> {
  const executor = connection ?? db;
  const [rows] = await executor.query<PricingRow[]>('SELECT * FROM tariff_settings WHERE id = 1');
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Тарифы временно недоступны'), { statusCode: 503, code: 'NO_TARIFFS' });
  return {
    currency: 'RUB',
    fare07To22Minor: row.fare_07_22_minor,
    fare22To02Minor: row.fare_22_02_minor,
    fare02To07Minor: row.fare_02_07_minor,
    childSurchargeMinor: row.child_surcharge_minor,
    waitingFreeMinutes: row.waiting_free_minutes,
    waitingPerMinuteMinor: row.waiting_per_minute_minor,
    serviceCommissionBps: row.service_commission_bps,
  };
}

function quoteTariffs(route: RouteMetrics, rules: PricingRules, scope: PricingScope) {
  const pricedAt = new Date();
  const periodDescription = farePeriodLabel[farePeriodAt(pricedAt)];
  return (['economy', 'child'] as const).map((code) => ({
    code,
    title: code === 'child' ? 'Детский' : 'Эконом',
    description:
      code === 'child'
        ? 'Подходящее детское кресло без выбора типа'
        : `Фиксированная цена · ${periodDescription}`,
    childSeatIncluded: code === 'child',
    etaMinutes: code === 'child' ? 7 : 4,
    priceMinor: calculateFareMinor(route.distanceMeters, code, scope, rules, pricedAt),
  }));
}

async function getOrder(id: string): Promise<OrderRow | null> {
  return firstRow<OrderRow>(`${orderSelect} WHERE o.id = ?`, [id]);
}

async function settleWaiting(
  connection: PoolConnection,
  row: OrderRow,
): Promise<{
  waitingSeconds: number;
  waitingPriceMinor: number;
  priceMinor: number;
  commissionMinor: number;
}> {
  const startedAt = row.waiting_started_at
    ? new Date(row.waiting_started_at).getTime()
    : null;
  const activeSeconds =
    startedAt == null || !Number.isFinite(startedAt)
      ? 0
      : Math.max(0, Math.floor((Date.now() - startedAt) / 1_000));
  const waitingSeconds = Number(row.waiting_seconds) + activeSeconds;
  const waitingPriceMinor = calculateWaitingChargeMinor(
    waitingSeconds,
    Number(row.waiting_free_minutes),
    Number(row.waiting_per_minute_minor),
  );
  const priceMinor = Number(row.base_price_minor) + waitingPriceMinor;
  const commissionMinor = calculateCommissionMinor(
    priceMinor,
    Number(row.commission_bps),
  );

  await connection.execute(
    `UPDATE orders SET waiting_seconds = ?, waiting_price_minor = ?,
      waiting_started_at = NULL, price_minor = ?, commission_minor = ?
     WHERE id = ?`,
    [waitingSeconds, waitingPriceMinor, priceMinor, commissionMinor, row.id],
  );

  return {
    waitingSeconds,
    waitingPriceMinor,
    priceMinor,
    commissionMinor,
  };
}

async function getDriver(userId: string, connection?: PoolConnection) {
  const executor = connection ?? db;
  const [rows] = await executor.query<
    (RowDataPacket & { id: string; status: string; commission_bps: number | null; vehicle_id: string | null })[]
  >(
    `SELECT d.id, d.status, d.commission_bps, v.id AS vehicle_id
     FROM drivers d LEFT JOIN vehicles v ON v.driver_id = d.id AND v.active = TRUE
     WHERE d.user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function openDriverShift(driverId: string, connection?: PoolConnection): Promise<void> {
  const executor = connection ?? db;
  await executor.execute(
    `INSERT INTO driver_shifts (driver_id, started_at)
     SELECT ?, UTC_TIMESTAMP(3)
     WHERE NOT EXISTS (
       SELECT 1 FROM driver_shifts WHERE driver_id = ? AND ended_at IS NULL
     )`,
    [driverId, driverId],
  );
}

async function closeDriverShift(driverId: string, connection?: PoolConnection): Promise<void> {
  const executor = connection ?? db;
  await executor.execute(
    `UPDATE driver_shifts SET ended_at = UTC_TIMESTAMP(3)
     WHERE driver_id = ? AND ended_at IS NULL`,
    [driverId],
  );
}

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  ip?: string,
) {
  await db.execute(
    `INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actorId, action, entityType, entityId, JSON.stringify(before), JSON.stringify(after), ip ?? null],
  );
}

function requireMaxConfiguration(): void {
  if (!config.MAX_BOT_USERNAME || !config.MAX_BOT_TOKEN || !config.MAX_WEBHOOK_SECRET) {
    throw Object.assign(new Error('Подтверждение через MAX пока не настроено'), {
      statusCode: 503,
      code: 'MAX_NOT_CONFIGURED',
    });
  }
}

function requireTelegramConfiguration(): void {
  if (
    !config.TELEGRAM_BOT_USERNAME ||
    !config.TELEGRAM_BOT_TOKEN ||
    !config.TELEGRAM_WEBHOOK_SECRET
  ) {
    throw Object.assign(new Error('Подтверждение через Telegram пока не настроено'), {
      statusCode: 503,
      code: 'TELEGRAM_NOT_CONFIGURED',
    });
  }
}

export async function registerRoutes(app: FastifyInstance, publish: EventPublisher): Promise<void> {
  const lastDriverLocationAcceptedAt = new Map<string, number>();
  const lastPassengerLocationAcceptedAt = new Map<string, number>();
  const notifyAdmins = (action: AdminTelegramAction): void => {
    void sendAdminTelegramAction(action).catch((error) =>
      app.log.warn({ error, action: action.title }, 'Telegram admin notification failed'),
    );
  };
  const notifyCritical = (
    report: Parameters<typeof sendCriticalErrorReport>[0],
  ): void => {
    void sendCriticalErrorReport(report).catch((error) =>
      app.log.warn({ error }, 'Telegram critical notification failed'),
    );
  };
  const notifyMessengers = (notification: Promise<void>, event: string): void => {
    void notification.catch((error) =>
      app.log.warn({ error, event }, 'personal messenger notification failed'),
    );
  };

  app.get(
    '/health/live',
    { config: { rateLimit: false } },
    async () => ({ data: { status: 'ok', service: 'taxi-grahovo-api' } }),
  );
  app.get(
    '/health/ready',
    { config: { rateLimit: false } },
    async () => {
      await db.query('SELECT 1');
      return { data: { status: 'ready' } };
    },
  );

  app.post(
    '/v1/client-errors',
    {
      logLevel: 'warn',
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const input = parse(clientErrorSchema, request.body);
      const session = await authenticate(request).catch(() => null);
      const reportedError = new Error(input.message);
      reportedError.name = input.name;
      if (input.stack) reportedError.stack = input.stack;
      notifyCritical({
        source: 'client',
        error: reportedError,
        context: [
          ['Тип события', input.source],
          ['Fatal', input.fatal ? 'да' : 'нет'],
          ['Платформа', input.platform],
          ['Версия', input.appVersion],
          ['Маршрут', input.route],
          ['Файл', input.filename],
          ['Строка', input.line],
          ['Колонка', input.column],
          ['Ресурс', input.resource],
          ['Сеть', input.online === undefined ? undefined : input.online ? 'онлайн' : 'офлайн'],
          ['Вкладка', input.visibilityState],
          ['Пользователь', session?.id],
          ['IP', request.ip],
          ['User-Agent', request.headers['user-agent']],
          ['Время на устройстве', input.occurredAt],
          ['Request ID', request.id],
        ],
      });
      reply.code(202);
      return { data: { accepted: true } };
    },
  );

  app.post(
    '/v1/webhooks/max',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (request, reply) => {
      requireMaxConfiguration();
      if (request.headers['x-max-bot-api-secret'] !== config.MAX_WEBHOOK_SECRET) {
        throw Object.assign(new Error('Недействительная подпись webhook MAX'), {
          statusCode: 401,
          code: 'MAX_WEBHOOK_UNAUTHORIZED',
        });
      }

      const update = parse(maxUpdateSchema, request.body);
      if (update.update_type === 'bot_started' && update.payload && update.user?.user_id != null) {
        const userId = String(update.user.user_id);
        const chatId = update.chat_id == null ? null : String(update.chat_id);
        const [result] = await db.execute<import('mysql2/promise').ResultSetHeader>(
          `UPDATE max_auth_challenges
           SET max_user_id = ?, max_chat_id = ?, max_username = ?,
             max_display_name = ?, failure_code = NULL
           WHERE payload_token = ? AND expires_at > UTC_TIMESTAMP(3)
             AND verified_at IS NULL`,
          [
            userId,
            chatId,
            update.user.username ?? null,
            update.user.name ?? null,
            update.payload,
          ],
        );
        if (result.affectedRows > 0) {
          await requestMaxContact(userId);
        }
      }

      if (update.update_type === 'message_created' && update.message?.sender?.user_id != null) {
        const userId = String(update.message.sender.user_id);
        const attachments = update.message.body?.attachments ?? [];
        const contact = attachments.find((attachment) => {
          if (!attachment || typeof attachment !== 'object') return false;
          const candidate = attachment as { type?: unknown; payload?: unknown };
          return candidate.type === 'contact' && candidate.payload && typeof candidate.payload === 'object';
        }) as { payload?: { vcf_info?: unknown; hash?: unknown } } | undefined;

        if (
          contact?.payload &&
          typeof contact.payload.vcf_info === 'string' &&
          verifyMaxContact(contact.payload, config.MAX_BOT_TOKEN)
        ) {
          const verifiedPhone = extractPhoneFromMaxVcf(contact.payload.vcf_info);
          const challenge = await firstRow<
            RowDataPacket & { id: string; expected_phone: string }
          >(
            `SELECT id, expected_phone FROM max_auth_challenges
             WHERE max_user_id = ? AND expires_at > UTC_TIMESTAMP(3)
               AND verified_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [userId],
          );
          if (challenge) {
            const matches = verifiedPhone === challenge.expected_phone;
            await db.execute(
              `UPDATE max_auth_challenges
               SET verified_phone = ?, failure_code = ?,
                 verified_at = IF(?, UTC_TIMESTAMP(3), NULL)
               WHERE id = ? AND verified_at IS NULL`,
              [verifiedPhone, matches ? null : 'PHONE_MISMATCH', matches, challenge.id],
            );
            await sendMaxConfirmation(userId, matches);
          }
        }
      }

      void reply.header('Cache-Control', 'no-store');
      return { success: true };
    },
  );

  app.post(
    '/v1/auth/max/start',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      requireMaxConfiguration();
      const raw = request.body && typeof request.body === 'object'
        ? request.body as Record<string, unknown>
        : {};
      const rawPhone = typeof raw.phone === 'string' ? raw.phone : undefined;
      const rawInstallationId =
        typeof raw.installationId === 'string' ? raw.installationId : undefined;
      const identity = buildAuthIdentity(request.ip, rawPhone, rawInstallationId);
      const eventId = await createAuthAttempt({
        requestId: String(request.id),
        action: 'start_max',
        identity,
        userAgent: request.headers['user-agent'],
      });
      let finalized = false;
      const finalize = async (
        outcome: string,
        details?: Record<string, unknown>,
        challengeId?: string,
      ) => {
        await finishAuthAttempt(eventId, outcome, details, challengeId);
        finalized = true;
      };
      try {
        let input: z.infer<typeof phoneAuthStartSchema>;
        try {
          input = parse(phoneAuthStartSchema, request.body);
        } catch (error) {
          await finalize('invalid_request');
          throw error;
        }
        const phone = normalizeRussianPhone(input.phone);
        if (!phone) {
          await finalize('invalid_phone');
          throw Object.assign(new Error('Укажите российский мобильный номер'), {
            statusCode: 400,
            code: 'PHONE_INVALID',
          });
        }

        const challengeId = randomUUID();
        const payloadToken = randomToken(24);
        const exchangeToken = randomToken(32);
        const expiresAt = new Date(Date.now() + config.PHONE_CODE_TTL_MINUTES * 60_000);
        await db.execute(
          `INSERT INTO max_auth_challenges
            (id, payload_token, exchange_secret_hash, expected_phone, legal_acceptance,
             consent_ip, consent_user_agent, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            challengeId,
            payloadToken,
            sha256(exchangeToken),
            phone,
            JSON.stringify(input.legalAcceptance),
            identity.ipAddress,
            request.headers['user-agent']?.slice(0, 255) ?? null,
            expiresAt,
          ],
        );
        await finalize('max_challenge_created', undefined, challengeId);
        return {
          data: {
            challengeId,
            exchangeToken,
            botUrl: `https://max.ru/${config.MAX_BOT_USERNAME}?start=${payloadToken}`,
            expiresInSeconds: config.PHONE_CODE_TTL_MINUTES * 60,
          },
        };
      } catch (error) {
        if (!finalized) {
          await finishAuthAttempt(eventId, 'internal_error').catch(() => undefined);
        }
        throw error;
      }
    },
  );

  app.post('/v1/auth/max/status', async (request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    const input = parse(maxAuthStatusSchema, request.body);
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          exchange_secret_hash: string;
          expected_phone: string;
          verified_phone: string | null;
          failure_code: string | null;
          legal_acceptance: string | object;
          consent_ip: string | null;
          consent_user_agent: string | null;
          expires_at: Date | string;
          max_user_id: string | null;
          max_chat_id: string | null;
          max_username: string | null;
          max_display_name: string | null;
        })[]
      >(
        `SELECT exchange_secret_hash, expected_phone, verified_phone, failure_code,
           legal_acceptance, consent_ip, consent_user_agent, expires_at,
           max_user_id, max_chat_id, max_username, max_display_name
         FROM max_auth_challenges WHERE id = ? FOR UPDATE`,
        [input.challengeId],
      );
      const challenge = rows[0];
      if (
        !challenge ||
        !hashesMatch(challenge.exchange_secret_hash, sha256(input.exchangeToken))
      ) {
        throw Object.assign(new Error('Подтверждение MAX не найдено'), {
          statusCode: 404,
          code: 'MAX_CHALLENGE_NOT_FOUND',
        });
      }
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { status: 'expired' as const };
      }
      if (challenge.failure_code) {
        return { status: 'failed' as const, errorCode: challenge.failure_code };
      }
      if (!challenge.verified_phone) return { status: 'pending' as const };

      const userId = await findOrCreatePhoneUser(connection, challenge.expected_phone);
      if (challenge.max_user_id) {
        await linkMessengerIdentity(connection, userId, {
          provider: 'max',
          externalUserId: challenge.max_user_id,
          chatId: challenge.max_chat_id ?? challenge.max_user_id,
          username: challenge.max_username,
          displayName: challenge.max_display_name,
        });
      }
      const acceptance = parse(
        initialLegalAcceptanceSchema,
        typeof challenge.legal_acceptance === 'string'
          ? JSON.parse(challenge.legal_acceptance)
          : challenge.legal_acceptance,
      );
      await recordInitialConsents(connection, userId, acceptance, {
        source: 'phone_auth',
        ip: challenge.consent_ip ?? undefined,
        userAgent: challenge.consent_user_agent ?? undefined,
      });
      await connection.execute(
        'UPDATE max_auth_challenges SET completed_at = UTC_TIMESTAMP(3) WHERE id = ?',
        [input.challengeId],
      );
      return { status: 'verified' as const, userId };
    });

    if (result.status !== 'verified') return { data: result };
    const user = await findUserWithRoles(result.userId);
    if (!user) {
      throw Object.assign(new Error('Пользователь не найден'), {
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }
    return {
      data: {
        status: 'verified',
        token: await signSession({ id: user.id, roles: user.roles }),
        user,
      },
    };
  });

  app.post(
    '/v1/webhooks/telegram',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (request, reply) => {
      requireTelegramConfiguration();
      if (
        request.headers['x-telegram-bot-api-secret-token'] !==
        config.TELEGRAM_WEBHOOK_SECRET
      ) {
        throw Object.assign(new Error('Недействительная подпись webhook Telegram'), {
          statusCode: 401,
          code: 'TELEGRAM_WEBHOOK_UNAUTHORIZED',
        });
      }

      await processTelegramUpdate(parse(telegramUpdateSchema, request.body));

      void reply.header('Cache-Control', 'no-store');
      return { ok: true };
    },
  );

  app.post(
    '/v1/auth/telegram/start',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      requireTelegramConfiguration();
      const raw = request.body && typeof request.body === 'object'
        ? request.body as Record<string, unknown>
        : {};
      const rawPhone = typeof raw.phone === 'string' ? raw.phone : undefined;
      const rawInstallationId =
        typeof raw.installationId === 'string' ? raw.installationId : undefined;
      const identity = buildAuthIdentity(request.ip, rawPhone, rawInstallationId);
      const eventId = await createAuthAttempt({
        requestId: String(request.id),
        action: 'start_telegram',
        identity,
        userAgent: request.headers['user-agent'],
      });
      let finalized = false;
      const finalize = async (
        outcome: string,
        details?: Record<string, unknown>,
        challengeId?: string,
      ) => {
        await finishAuthAttempt(eventId, outcome, details, challengeId);
        finalized = true;
      };
      try {
        let input: z.infer<typeof phoneAuthStartSchema>;
        try {
          input = parse(phoneAuthStartSchema, request.body);
        } catch (error) {
          await finalize('invalid_request');
          throw error;
        }
        const phone = normalizeRussianPhone(input.phone);
        if (!phone) {
          await finalize('invalid_phone');
          throw Object.assign(new Error('Укажите российский мобильный номер'), {
            statusCode: 400,
            code: 'PHONE_INVALID',
          });
        }

        const challengeId = randomUUID();
        const payloadToken = randomToken(24);
        const exchangeToken = randomToken(32);
        const expiresAt = new Date(Date.now() + config.PHONE_CODE_TTL_MINUTES * 60_000);
        await db.execute(
          `INSERT INTO telegram_auth_challenges
            (id, payload_token, exchange_secret_hash, expected_phone, legal_acceptance,
             consent_ip, consent_user_agent, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            challengeId,
            payloadToken,
            sha256(exchangeToken),
            phone,
            JSON.stringify(input.legalAcceptance),
            identity.ipAddress,
            request.headers['user-agent']?.slice(0, 255) ?? null,
            expiresAt,
          ],
        );
        await finalize('telegram_challenge_created', undefined, challengeId);
        return {
          data: {
            challengeId,
            exchangeToken,
            botUrl: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${payloadToken}`,
            appUrl: `tg://resolve?domain=${config.TELEGRAM_BOT_USERNAME}&start=${payloadToken}`,
            expiresInSeconds: config.PHONE_CODE_TTL_MINUTES * 60,
          },
        };
      } catch (error) {
        if (!finalized) {
          await finishAuthAttempt(eventId, 'internal_error').catch(() => undefined);
        }
        throw error;
      }
    },
  );

  app.post('/v1/auth/telegram/status', async (request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    const input = parse(maxAuthStatusSchema, request.body);
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          exchange_secret_hash: string;
          expected_phone: string;
          verified_phone: string | null;
          failure_code: string | null;
          legal_acceptance: string | object;
          consent_ip: string | null;
          consent_user_agent: string | null;
          expires_at: Date | string;
          telegram_user_id: string | null;
          telegram_chat_id: string | null;
          telegram_username: string | null;
          telegram_first_name: string | null;
          telegram_last_name: string | null;
        })[]
      >(
        `SELECT exchange_secret_hash, expected_phone, verified_phone, failure_code,
           legal_acceptance, consent_ip, consent_user_agent, expires_at,
           telegram_user_id, telegram_chat_id, telegram_username,
           telegram_first_name, telegram_last_name
         FROM telegram_auth_challenges WHERE id = ? FOR UPDATE`,
        [input.challengeId],
      );
      const challenge = rows[0];
      if (
        !challenge ||
        !hashesMatch(challenge.exchange_secret_hash, sha256(input.exchangeToken))
      ) {
        throw Object.assign(new Error('Подтверждение Telegram не найдено'), {
          statusCode: 404,
          code: 'TELEGRAM_CHALLENGE_NOT_FOUND',
        });
      }
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { status: 'expired' as const };
      }
      if (challenge.failure_code) {
        return { status: 'failed' as const, errorCode: challenge.failure_code };
      }
      if (!challenge.verified_phone) return { status: 'pending' as const };

      const userId = await findOrCreatePhoneUser(connection, challenge.expected_phone);
      if (challenge.telegram_user_id) {
        await linkMessengerIdentity(connection, userId, {
          provider: 'telegram',
          externalUserId: challenge.telegram_user_id,
          chatId: challenge.telegram_chat_id ?? challenge.telegram_user_id,
          username: challenge.telegram_username,
          firstName: challenge.telegram_first_name,
          lastName: challenge.telegram_last_name,
        });
      }
      const acceptance = parse(
        initialLegalAcceptanceSchema,
        typeof challenge.legal_acceptance === 'string'
          ? JSON.parse(challenge.legal_acceptance)
          : challenge.legal_acceptance,
      );
      await recordInitialConsents(connection, userId, acceptance, {
        source: 'phone_auth',
        ip: challenge.consent_ip ?? undefined,
        userAgent: challenge.consent_user_agent ?? undefined,
      });
      await connection.execute(
        'UPDATE telegram_auth_challenges SET completed_at = UTC_TIMESTAMP(3) WHERE id = ?',
        [input.challengeId],
      );
      return { status: 'verified' as const, userId };
    });

    if (result.status !== 'verified') return { data: result };
    const user = await findUserWithRoles(result.userId);
    if (!user) {
      throw Object.assign(new Error('Пользователь не найден'), {
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }
    return {
      data: {
        status: 'verified',
        token: await signSession({ id: user.id, roles: user.roles }),
        user,
      },
    };
  });

  app.post(
    '/v1/auth/phone/start',
    {
      logLevel: 'warn',
      config: { rateLimit: false },
    },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const raw = request.body && typeof request.body === 'object'
        ? request.body as Record<string, unknown>
        : {};
      const rawPhone = typeof raw.phone === 'string' ? raw.phone : undefined;
      const rawInstallationId =
        typeof raw.installationId === 'string' ? raw.installationId : undefined;
      const identity = buildAuthIdentity(request.ip, rawPhone, rawInstallationId);
      const eventId = await createAuthAttempt({
        requestId: String(request.id),
        action: 'send_code',
        identity,
        userAgent: request.headers['user-agent'],
      });
      let finalized = false;
      const finalize = async (
        outcome: string,
        details?: Record<string, unknown>,
        challengeId?: string,
      ) => {
        try {
          await finishAuthAttempt(eventId, outcome, details, challengeId);
          finalized = true;
        } catch (error) {
          request.log.error(error, 'auth attempt finalization failed');
        }
      };
      let rateLimitConsumedAt: Date | null = null;

      try {
        let input: z.infer<typeof phoneAuthStartSchema>;
        try {
          input = parse(phoneAuthStartSchema, request.body);
        } catch (error) {
          await finalize('invalid_request');
          throw error;
        }

        const phone = normalizeRussianPhone(input.phone);
        if (!phone) {
          await finalize('invalid_phone');
          throw Object.assign(new Error('Укажите российский мобильный номер'), {
            statusCode: 400,
            code: 'PHONE_INVALID',
          });
        }
        const isPlayReviewAccount = isPlayReviewPhone(phone);

        const recent = await firstRow<RowDataPacket & { age_seconds: number }>(
          `SELECT GREATEST(
             0,
             TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP(3))
           ) AS age_seconds
           FROM phone_auth_challenges
           WHERE phone = ? AND verified_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [phone],
        );
        const retryAfter = Math.max(
          0,
          config.PHONE_CODE_RESEND_SECONDS -
            Number(recent?.age_seconds ?? config.PHONE_CODE_RESEND_SECONDS),
        );
        if (retryAfter > 0) {
          void reply.header('Retry-After', String(retryAfter));
          await finalize('too_soon', { retryAfterSeconds: retryAfter });
          throw Object.assign(
            new Error(`Новый код можно запросить через ${formatRetryAfter(retryAfter)}.`),
            {
              statusCode: 429,
              code: 'PHONE_CODE_TOO_SOON',
            },
          );
        }

        const consumedAt = new Date();
        const blocked = await consumeAuthRateLimits('send_code', identity, consumedAt);
        if (blocked) {
          void reply.header('Retry-After', String(blocked.retryAfterSeconds));
          await finalize(`blocked_${blocked.scope}`, {
            retryAfterSeconds: blocked.retryAfterSeconds,
            windowSeconds: blocked.windowSeconds,
            max: blocked.max,
          });
          throw Object.assign(
            new Error(
              `Слишком много запросов. Попробуйте через ${formatRetryAfter(blocked.retryAfterSeconds)}.`,
            ),
            { statusCode: 429, code: 'AUTH_RATE_LIMITED' },
          );
        }
        rateLimitConsumedAt = consumedAt;

        const challengeId = randomUUID();
        const code = isPlayReviewAccount
          ? PLAY_REVIEW_CODE
          : String(randomInt(1_000, 10_000));
        const codeHash = phoneCodeHash(challengeId, phone, code, config.JWT_SECRET);
        const fallbackExpiresInSeconds = config.PHONE_CODE_TTL_MINUTES * 60;
        let expiresInSeconds = fallbackExpiresInSeconds;
        const expiresAt = new Date(Date.now() + fallbackExpiresInSeconds * 1_000);
        await db.execute(
          `INSERT INTO phone_auth_challenges
            (id, phone, code_hash, legal_acceptance, consent_ip, consent_user_agent, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            challengeId,
            phone,
            codeHash,
            JSON.stringify(input.legalAcceptance),
            identity.ipAddress,
            request.headers['user-agent']?.slice(0, 255) ?? null,
            expiresAt,
          ],
        );

        if (!isPlayReviewAccount) {
          try {
            const smsSession = await sendPhoneVerificationCode(phone, code, identity.ipAddress);
            expiresInSeconds = smsSession.expiresInSeconds;
            const sessionExpiresAt = new Date(Date.now() + smsSession.expiresInSeconds * 1_000);
            await db.execute(
              `UPDATE phone_auth_challenges
               SET provider_authentication_id = ?, expires_at = ?
               WHERE id = ?`,
              [smsSession.providerAuthenticationId, sessionExpiresAt, challengeId],
            );
          } catch (error) {
            await db.execute('DELETE FROM phone_auth_challenges WHERE id = ?', [challengeId]);
            await finalize('sms_failed', undefined, challengeId);
            request.log.warn(
              { error: error instanceof Error ? error.message : 'unknown' },
              'phone authentication SMS failed',
            );
            throw Object.assign(new Error('Не удалось отправить SMS. Попробуйте позднее'), {
              statusCode: 502,
              code: 'SMS_SEND_FAILED',
            });
          }
        }

        rateLimitConsumedAt = null;
        await finalize(
          isPlayReviewAccount ? 'play_review_code_ready' : 'sms_sent',
          undefined,
          challengeId,
        );
        return {
          data: {
            phone: maskPhone(phone),
            expiresInSeconds,
            retryAfterSeconds: config.PHONE_CODE_RESEND_SECONDS,
            ...(!config.isProduction && config.SMS_PROVIDER === 'console'
              ? { debugCode: code }
              : {}),
          },
        };
      } catch (error) {
        if (rateLimitConsumedAt) {
          await refundAuthRateLimits('send_code', identity, rateLimitConsumedAt).catch(
            (refundError) => request.log.error(refundError, 'SMS rate-limit refund failed'),
          );
        }
        if (!finalized) await finalize('internal_error');
        throw error;
      }
    },
  );

  app.post(
    '/v1/auth/phone/verify',
    {
      logLevel: 'warn',
      config: { rateLimit: false },
    },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const raw = request.body && typeof request.body === 'object'
        ? request.body as Record<string, unknown>
        : {};
      const rawPhone = typeof raw.phone === 'string' ? raw.phone : undefined;
      const rawInstallationId =
        typeof raw.installationId === 'string' ? raw.installationId : undefined;
      const identity = buildAuthIdentity(request.ip, rawPhone, rawInstallationId);
      const eventId = await createAuthAttempt({
        requestId: String(request.id),
        action: 'verify_code',
        identity,
        userAgent: request.headers['user-agent'],
      });
      let finalized = false;
      const finalize = async (
        outcome: string,
        details?: Record<string, unknown>,
        challengeId?: string,
      ) => {
        try {
          await finishAuthAttempt(eventId, outcome, details, challengeId);
          finalized = true;
        } catch (error) {
          request.log.error(error, 'auth attempt finalization failed');
        }
      };

      try {
        let input: z.infer<typeof phoneAuthVerifySchema>;
        try {
          input = parse(phoneAuthVerifySchema, request.body);
        } catch (error) {
          await finalize('invalid_request');
          throw error;
        }

        const phone = normalizeRussianPhone(input.phone);
        if (!phone) {
          await finalize('invalid_phone');
          throw Object.assign(new Error('Укажите российский мобильный номер'), {
            statusCode: 400,
            code: 'PHONE_INVALID',
          });
        }

        const blocked = await consumeAuthRateLimits('verify_code', identity);
        if (blocked) {
          void reply.header('Retry-After', String(blocked.retryAfterSeconds));
          await finalize(`blocked_${blocked.scope}`, {
            retryAfterSeconds: blocked.retryAfterSeconds,
            windowSeconds: blocked.windowSeconds,
            max: blocked.max,
          });
          throw Object.assign(
            new Error(
              `Слишком много попыток. Попробуйте через ${formatRetryAfter(blocked.retryAfterSeconds)}.`,
            ),
            { statusCode: 429, code: 'AUTH_RATE_LIMITED' },
          );
        }

        const verification = await withTransaction(async (connection) => {
        const [rows] = await connection.query<
          (RowDataPacket & {
            id: string;
            code_hash: string;
            provider_authentication_id: string | null;
            attempts: number;
            legal_acceptance: string | object;
            consent_ip: string | null;
            consent_user_agent: string | null;
          })[]
        >(
          `SELECT id, code_hash, provider_authentication_id, attempts,
                  legal_acceptance, consent_ip, consent_user_agent
           FROM phone_auth_challenges
           WHERE phone = ? AND verified_at IS NULL
             AND expires_at > UTC_TIMESTAMP(3)
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [phone],
        );
        const challenge = rows[0];
        if (!challenge || Number(challenge.attempts) >= 5) {
          return { status: 'expired' as const, challengeId: challenge?.id };
        }

        const providerResult = challenge.provider_authentication_id
          ? await verifyPhoneVerificationCode(challenge.provider_authentication_id, input.code)
          : null;
        const candidateHash = providerResult === null
          ? phoneCodeHash(challenge.id, phone, input.code, config.JWT_SECRET)
          : null;
        if (
          providerResult === 'invalid' ||
          (candidateHash !== null && !hashesMatch(challenge.code_hash, candidateHash))
        ) {
          await connection.execute(
            'UPDATE phone_auth_challenges SET attempts = attempts + 1 WHERE id = ?',
            [challenge.id],
          );
          return { status: 'invalid' as const, challengeId: challenge.id };
        }
        if (providerResult === 'expired') {
          return { status: 'expired' as const, challengeId: challenge.id };
        }

        await connection.execute(
          'UPDATE phone_auth_challenges SET verified_at = UTC_TIMESTAMP(3) WHERE id = ?',
          [challenge.id],
        );
        const id = await findOrCreatePhoneUser(connection, phone);
        if (isPlayReviewPhone(phone)) {
          await connection.execute(
            `UPDATE users
             SET name = 'Тестовый пассажир Google Play',
                 gender = 'male',
                 profile_completed_at = COALESCE(profile_completed_at, UTC_TIMESTAMP(3)),
                 phone_verified_at = UTC_TIMESTAMP(3)
             WHERE id = ?`,
            [id],
          );
          await connection.execute(
            "DELETE FROM user_roles WHERE user_id = ? AND role <> 'passenger'",
            [id],
          );
        }
        const acceptance = parse(
          initialLegalAcceptanceSchema,
          typeof challenge.legal_acceptance === 'string'
            ? JSON.parse(challenge.legal_acceptance)
            : challenge.legal_acceptance,
        );
        await recordInitialConsents(connection, id, acceptance, {
          source: 'phone_auth',
          ip: challenge.consent_ip ?? undefined,
          userAgent: challenge.consent_user_agent ?? undefined,
        });
          return { status: 'verified' as const, userId: id, challengeId: challenge.id };
        });

        if (verification.status === 'expired') {
          await finalize('code_expired', undefined, verification.challengeId);
          throw Object.assign(new Error('Код устарел. Запросите новый'), {
            statusCode: 400,
            code: 'PHONE_CODE_EXPIRED',
          });
        }
        if (verification.status === 'invalid') {
          await finalize('invalid_code', undefined, verification.challengeId);
          throw Object.assign(new Error('Неверный код из SMS'), {
            statusCode: 400,
            code: 'PHONE_CODE_INVALID',
          });
        }

        const user = await findUserWithRoles(verification.userId);
        if (!user) {
          throw Object.assign(new Error('Пользователь не найден'), {
            statusCode: 404,
            code: 'USER_NOT_FOUND',
          });
        }
        await finalize('verified', undefined, verification.challengeId);
        return {
          data: {
            token: await signSession({ id: user.id, roles: user.roles }),
            user,
          },
        };
      } catch (error) {
        if (!finalized) await finalize('internal_error');
        throw error;
      }
    },
  );

  app.get('/v1/me', async (request) => {
    const session = await auth(request);
    const user = await findUserWithRoles(session.id);
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
    return { data: user };
  });

  app.put('/v1/me/profile', async (request) => {
    const session = await auth(request);
    const input = parse(profileSchema, request.body);
    await db.execute(
      `UPDATE users
       SET name = ?, gender = ?, profile_completed_at = COALESCE(profile_completed_at, UTC_TIMESTAMP(3))
       WHERE id = ? AND deleted_at IS NULL`,
      [input.name, input.gender, session.id],
    );
    const user = await findUserWithRoles(session.id);
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
    return { data: user };
  });

  app.put(
    '/v1/me/avatar',
    {
      bodyLimit: 4 * 1024 * 1024,
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request) => {
      const session = await auth(request);
      const input = parse(avatarSchema, request.body);
      const bytes = decodeAvatar(input);
      await db.execute(
        `UPDATE users
         SET avatar_data = ?, avatar_mime = ?, avatar_url = NULL
         WHERE id = ? AND deleted_at IS NULL`,
        [bytes, input.mimeType, session.id],
      );
      const user = await findUserWithRoles(session.id);
      if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
      return { data: user };
    },
  );

  app.delete('/v1/me/avatar', async (request) => {
    const session = await auth(request);
    await db.execute(
      `UPDATE users
       SET avatar_data = NULL, avatar_mime = NULL, avatar_url = NULL
       WHERE id = ? AND deleted_at IS NULL`,
      [session.id],
    );
    const user = await findUserWithRoles(session.id);
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
    return { data: user };
  });

  app.get('/v1/users/:id/avatar', async (request, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const row = await firstRow<
      RowDataPacket & { avatar_data: Buffer | null; avatar_mime: string | null }
    >(
      `SELECT avatar_data, avatar_mime
       FROM users
       WHERE id = ? AND deleted_at IS NULL AND avatar_data IS NOT NULL`,
      [id],
    );
    if (!row?.avatar_data || !row.avatar_mime) {
      throw Object.assign(new Error('Аватар не найден'), {
        statusCode: 404,
        code: 'AVATAR_NOT_FOUND',
      });
    }
    return reply
      .header('Cache-Control', 'public, max-age=86400, immutable')
      .type(row.avatar_mime)
      .send(row.avatar_data);
  });

  app.post('/v1/auth/refresh', async (request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    const session = await auth(request);
    const user = await findUserWithRoles(session.id);
    if (!user) {
      throw Object.assign(new Error('Пользователь не найден'), {
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }
    if (!(await withTransaction((connection) => hasCurrentInitialConsents(connection, session.id)))) {
      throw Object.assign(new Error('Примите актуальные правила и согласие на обработку данных'), {
        statusCode: 403,
        code: 'LEGAL_CONSENT_REQUIRED',
      });
    }
    return {
      data: {
        token: await signSession({ id: user.id, roles: user.roles }),
        user,
      },
    };
  });

  app.get('/v1/me/consents', async (request) => {
    const session = await auth(request);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT document_type AS documentType, document_version AS documentVersion,
        source, accepted_at AS acceptedAt, revoked_at AS revokedAt
       FROM user_consents WHERE user_id = ? ORDER BY accepted_at DESC`,
      [session.id],
    );
    return { data: rows };
  });

  app.put('/v1/push-tokens', async (request) => {
    const session = await auth(request);
    const input = parse(
      z.object({
        token: z.string().min(20).max(255),
        platform: z.enum(['ios', 'android']),
      }),
      request.body,
    );
    await db.execute(
      `INSERT INTO push_tokens (token, user_id, platform) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform)`,
      [input.token, session.id, input.platform],
    );
    return { data: { registered: true } };
  });

  app.get('/v1/addresses/search', async (request) => {
    await auth(request, 'passenger');
    const { query } = parse(z.object({ query: z.string().trim().min(2).max(180) }), request.query);
    try {
      return { data: await searchAddresses(query) };
    } catch {
      throw Object.assign(new Error('Поиск адресов временно недоступен'), {
        statusCode: 502,
        code: 'GEOCODER_ERROR',
      });
    }
  });

  app.get(
    '/v1/addresses/preview',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      if (config.isProduction) {
        throw Object.assign(new Error('Поиск демо доступен только в режиме разработки'), {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }
      const { query } = parse(
        z.object({ query: z.string().trim().min(2).max(180) }),
        request.query,
      );
      try {
        return { data: await searchAddresses(query) };
      } catch {
        throw Object.assign(new Error('Поиск адресов временно недоступен'), {
          statusCode: 502,
          code: 'GEOCODER_ERROR',
        });
      }
    },
  );

  app.post('/v1/quotes', async (request) => {
    await auth(request, 'passenger');
    const input = parse(quoteSchema, request.body);
    const pricingScope = classifyPricingScope(input.pickup, input.destination);
    const [route, rules] = await Promise.all([
      getRouteMetrics(input.pickup.coordinates, input.destination.coordinates),
      pricingRules(),
    ]);
    return {
      data: {
        route,
        pricingScope,
        tariffs: quoteTariffs(route, rules, pricingScope),
        currency: 'RUB',
      },
    };
  });

  app.post(
    '/v1/routes/preview',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      if (config.isProduction) {
        throw Object.assign(new Error('Маршрут демо доступен только в режиме разработки'), {
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }
      const input = parse(quoteSchema, request.body);
      const pricingScope = classifyPricingScope(input.pickup, input.destination);
      const [route, rules] = await Promise.all([
        getRouteMetrics(input.pickup.coordinates, input.destination.coordinates),
        pricingRules(),
      ]);
      return {
        data: {
          route,
          pricingScope,
          tariffs: quoteTariffs(route, rules, pricingScope),
          currency: 'RUB',
        },
      };
    },
  );

  app.post('/v1/orders', async (request, reply) => {
    const session = await auth(request, 'passenger');
    const input = parse(createOrderSchema, request.body);
    const route = await getRouteMetrics(input.pickup.coordinates, input.destination.coordinates);
    const pricingScope = classifyPricingScope(input.pickup, input.destination);
    const orderId = randomUUID();
    const hashedDevice = deviceFingerprint(input.deviceId, config.JWT_SECRET);
    const result = await withTransaction(async (connection) => {
      const [existingRows] = await connection.query<OrderRow[]>(
        `${orderSelect} WHERE o.passenger_id = ? AND o.idempotency_key = ?`,
        [session.id, input.idempotencyKey],
      );
      if (existingRows[0]) return { order: presentOrder(existingRows[0]), created: false };

      const [userRows] = await connection.query<
        (RowDataPacket & {
          phone: string | null;
          phone_verified_at: Date | string | null;
          order_blocked_until: Date | string | null;
        })[]
      >(
        `SELECT phone, phone_verified_at, order_blocked_until
         FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [session.id],
      );
      const passenger = userRows[0];
      if (!passenger?.phone || !passenger.phone_verified_at) {
        throw Object.assign(new Error('Подтвердите номер телефона по SMS перед первым заказом'), {
          statusCode: 403,
          code: 'PHONE_VERIFICATION_REQUIRED',
        });
      }
      const blockedUntil = passenger.order_blocked_until
        ? new Date(passenger.order_blocked_until)
        : null;
      if (blockedUntil && blockedUntil.getTime() > Date.now()) {
        throw Object.assign(
          new Error(
            `Заказы временно недоступны до ${blockedUntil.toLocaleString('ru-RU', {
              timeZone: 'Europe/Samara',
            })} из-за частых отмен`,
          ),
          {
            statusCode: 403,
            code: 'ACCOUNT_TEMPORARILY_BLOCKED',
          },
        );
      }

      const phoneLockKey = deviceFingerprint(`phone:${passenger.phone}`, config.JWT_SECRET);
      await connection.execute(
        `INSERT IGNORE INTO order_identity_locks (lock_key)
         VALUES (?), (?)`,
        [phoneLockKey, hashedDevice],
      );
      await connection.query(
        `SELECT lock_key
         FROM order_identity_locks
         WHERE lock_key IN (?, ?)
         ORDER BY lock_key
         FOR UPDATE`,
        [phoneLockKey, hashedDevice],
      );

      const [activeRows] = await connection.query<
        (RowDataPacket & { id: string; same_user: number; same_phone: number; same_device: number })[]
      >(
        `SELECT o.id,
           (o.passenger_id = ?) AS same_user,
           (u.phone = ?) AS same_phone,
           (o.device_fingerprint = ?) AS same_device
         FROM orders o
         JOIN users u ON u.id = o.passenger_id
         WHERE o.status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress')
           AND (o.passenger_id = ? OR u.phone = ? OR o.device_fingerprint = ?)
         LIMIT 1 FOR UPDATE`,
        [
          session.id,
          passenger.phone,
          hashedDevice,
          session.id,
          passenger.phone,
          hashedDevice,
        ],
      );
      if (activeRows[0]) {
        const message = activeRows[0].same_device
          ? 'На этом устройстве уже есть активный заказ'
          : activeRows[0].same_phone
            ? 'На этот номер телефона уже оформлен активный заказ'
            : 'У вас уже есть активная поездка';
        throw Object.assign(new Error(message), {
          statusCode: 409,
          code: 'ACTIVE_ORDER_EXISTS',
        });
      }
      const rules = await pricingRules(connection);
      const price = calculateFareMinor(
        route.distanceMeters,
        input.tariff,
        pricingScope,
        rules,
        new Date(),
      );
      const commission = calculateCommissionMinor(price, rules.serviceCommissionBps);
      await connection.execute(
        `INSERT INTO orders (
          id, passenger_id, device_fingerprint, tariff, status, pricing_scope,
          pickup_label, pickup_details, pickup_lat, pickup_lon,
          destination_label, destination_details, destination_lat, destination_lon,
          distance_meters, duration_seconds, route_geometry,
          base_price_minor, price_minor, commission_minor, commission_bps,
          waiting_free_minutes, waiting_per_minute_minor,
          payment_method, comment, idempotency_key
        ) VALUES (?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          session.id,
          hashedDevice,
          input.tariff,
          pricingScope,
          input.pickup.label,
          input.pickup.details ?? null,
          input.pickup.coordinates.latitude,
          input.pickup.coordinates.longitude,
          input.destination.label,
          input.destination.details ?? null,
          input.destination.coordinates.latitude,
          input.destination.coordinates.longitude,
          route.distanceMeters,
          route.durationSeconds,
          JSON.stringify(route.coordinates),
          price,
          price,
          commission,
          rules.serviceCommissionBps,
          rules.waitingFreeMinutes,
          rules.waitingPerMinuteMinor,
          input.paymentMethod,
          input.comment ?? null,
          input.idempotencyKey,
        ],
      );
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, to_status, payload)
         VALUES (?, ?, 'order.created', 'searching', ?)`,
        [orderId, session.id, JSON.stringify({ routeSource: route.source })],
      );
      const [insertedRows] = await connection.query<OrderRow[]>(
        `${orderSelect} WHERE o.id = ?`,
        [orderId],
      );
      const row = insertedRows[0];
      if (!row) throw new Error('Order insert failed');
      return { order: presentOrder(row), created: true };
    });
    if (result.created) {
      publish('drivers', 'order:available', result.order);
      notifyAdmins({
        icon: '🚕',
        title: 'Создан новый заказ',
        actor: {
          role: 'пассажир',
          id: session.id,
          name: result.order.passenger?.name,
        },
        entity: { label: 'Заказ', id: result.order.id },
        details: [
          ['Маршрут', `${result.order.pickup.label} → ${result.order.destination.label}`],
          ['Тариф', tariffLabels[result.order.tariff]],
          ['Стоимость', formatMoney(result.order.priceMinor)],
          ['Оплата', paymentMethodLabels[result.order.paymentMethod]],
          ['Комментарий', result.order.comment],
        ],
      });
      void notifyOnlineDrivers({
        title: 'Новый заказ',
        body: `${result.order.pickup.label} → ${result.order.destination.label}`,
        data: { orderId: result.order.id, role: 'driver' },
        sound: 'new_order.wav',
        channelId: 'driver-orders-v2',
      }).catch((error) => app.log.warn({ error }, 'push notification failed'));
      notifyMessengers(
        notifyUsersInMessengers([session.id], {
          icon: '🔎',
          title: 'Заказ создан',
          body: 'Ищем свободного водителя. Сообщим, как только машина будет назначена.',
          details: [
            ['Маршрут', `${result.order.pickup.label} → ${result.order.destination.label}`],
            ['Стоимость', formatMoney(result.order.priceMinor)],
          ],
          action: { label: 'Открыть заказ', url: appUrl(`/orders/${result.order.id}`) },
        }),
        'order.created.passenger',
      );
      notifyMessengers(
        notifyOnlineDriversInMessengers({
          icon: '🚕',
          title: 'Новый заказ',
          body: `${result.order.pickup.label} → ${result.order.destination.label}`,
          details: [
            ['Тариф', tariffLabels[result.order.tariff]],
            ['Стоимость', formatMoney(result.order.priceMinor)],
            ['Комментарий', result.order.comment],
          ],
          action: { label: 'Посмотреть заказ', url: appUrl('/driver') },
        }),
        'order.created.drivers',
      );
      reply.code(201);
    }
    return { data: result.order };
  });

  app.get('/v1/orders', async (request) => {
    const session = await auth(request);
    const query = request.query as { status?: string };
    const isAdmin = session.roles.includes('admin');
    const driver = session.roles.includes('driver') ? await getDriver(session.id) : null;
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (!isAdmin) {
      if (driver) {
        clauses.push('(o.passenger_id = ? OR o.driver_id = ?)');
        values.push(session.id, driver.id);
      } else {
        clauses.push('o.passenger_id = ?');
        values.push(session.id);
      }
    }
    if (query.status) {
      clauses.push('o.status = ?');
      values.push(query.status);
    }
    const [rows] = await db.query<OrderRow[]>(
      `${orderSelect}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY o.created_at DESC LIMIT 100`,
      values,
    );
    return { data: rows.map(presentOrder) };
  });

  app.get('/v1/orders/:id', async (request) => {
    const session = await auth(request);
    const { id } = request.params as { id: string };
    const row = await getOrder(id);
    if (!row) throw Object.assign(new Error('Заказ не найден'), { statusCode: 404 });
    const driver = session.roles.includes('driver') ? await getDriver(session.id) : null;
    if (!session.roles.includes('admin') && row.passenger_id !== session.id && row.driver_id !== driver?.id) {
      throw Object.assign(new Error('Нет доступа к заказу'), { statusCode: 403 });
    }
    return { data: presentOrder(row) };
  });

  app.post(
    '/v1/orders/:id/rating',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await auth(request);
      const { id } = request.params as { id: string };
      const { score } = parse(ratingSchema, request.body);
      const participants = await withTransaction(async (connection) => {
        const [rows] = await connection.query<
          (RowDataPacket & {
            passenger_id: string;
            driver_id: string | null;
            driver_user_id: string | null;
            status: RideStatus;
          })[]
        >(
          `SELECT o.passenger_id, o.driver_id, o.status, d.user_id AS driver_user_id
           FROM orders o
           LEFT JOIN drivers d ON d.id = o.driver_id
           WHERE o.id = ? FOR UPDATE`,
          [id],
        );
        const order = rows[0];
        if (!order) {
          throw Object.assign(new Error('Заказ не найден'), { statusCode: 404, code: 'ORDER_NOT_FOUND' });
        }
        if (order.status !== 'completed' || !order.driver_id || !order.driver_user_id) {
          throw Object.assign(new Error('Оценить можно только завершённую поездку'), {
            statusCode: 409,
            code: 'RIDE_NOT_COMPLETED',
          });
        }

        const driver = session.roles.includes('driver')
          ? await getDriver(session.id, connection)
          : null;
        const raterRole =
          order.passenger_id === session.id
            ? 'passenger'
            : order.driver_id === driver?.id
              ? 'driver'
              : null;
        if (!raterRole) {
          throw Object.assign(new Error('Оценивать поездку могут только её участники'), {
            statusCode: 403,
            code: 'RATING_FORBIDDEN',
          });
        }
        const rateeUserId =
          raterRole === 'passenger' ? order.driver_user_id : order.passenger_id;
        if (rateeUserId === session.id) {
          throw Object.assign(new Error('Нельзя оценить самого себя'), {
            statusCode: 409,
            code: 'SELF_RATING_FORBIDDEN',
          });
        }
        const [existingRows] = await connection.query<(RowDataPacket & { id: string })[]>(
          'SELECT id FROM ride_ratings WHERE order_id = ? AND rater_role = ? LIMIT 1',
          [id, raterRole],
        );
        if (existingRows[0]) {
          throw Object.assign(new Error('Вы уже оценили эту поездку'), {
            statusCode: 409,
            code: 'RATING_ALREADY_SUBMITTED',
          });
        }

        await connection.execute(
          `INSERT INTO ride_ratings
            (id, order_id, rater_user_id, ratee_user_id, rater_role, score)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [randomUUID(), id, session.id, rateeUserId, raterRole, score],
        );
        if (raterRole === 'passenger') {
          await connection.execute(
            `UPDATE drivers d
             SET d.rating = (
               SELECT AVG(rr.score) FROM ride_ratings rr WHERE rr.ratee_user_id = d.user_id
             ),
             d.rating_count = (
               SELECT COUNT(*) FROM ride_ratings rr WHERE rr.ratee_user_id = d.user_id
             )
             WHERE d.user_id = ?`,
            [rateeUserId],
          );
        } else {
          await connection.execute(
            `UPDATE users u
             SET u.rating = (
               SELECT AVG(rr.score) FROM ride_ratings rr WHERE rr.ratee_user_id = u.id
             ),
             u.rating_count = (
               SELECT COUNT(*) FROM ride_ratings rr WHERE rr.ratee_user_id = u.id
             )
             WHERE u.id = ?`,
            [rateeUserId],
          );
        }
        await connection.execute(
          `INSERT INTO order_events
            (order_id, actor_user_id, event_type, payload)
           VALUES (?, ?, 'order.rated', ?)`,
          [id, session.id, JSON.stringify({ raterRole, score })],
        );
        return {
          passengerId: order.passenger_id,
          driverId: order.driver_id,
          raterRole,
        };
      });

      const updated = await getOrder(id);
      if (!updated) throw new Error('Order disappeared');
      const payload = presentOrder(updated);
      publish(`user:${participants.passengerId}`, 'order:updated', payload);
      publish(`driver:${participants.driverId}`, 'order:updated', payload);
      const rater = participants.raterRole === 'passenger' ? payload.passenger : payload.driver;
      notifyAdmins({
        icon: score <= 2 ? '⚠️' : '⭐',
        title: 'Поставлена оценка за поездку',
        actor: {
          role: participants.raterRole === 'passenger' ? 'пассажир' : 'водитель',
          id: session.id,
          name: rater?.name,
          phone: rater?.phone,
        },
        entity: { label: 'Заказ', id },
        details: [
          ['Оценка', `${score} из 5`],
          ['Кому', participants.raterRole === 'passenger' ? 'водителю' : 'пассажиру'],
          ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
        ],
      });
      return { data: payload };
    },
  );

  app.post('/v1/orders/:id/cancel', async (request) => {
    const session = await auth(request);
    const { id } = request.params as { id: string };
    const participants = await withTransaction(async (connection) => {
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!row) throw Object.assign(new Error('Заказ не найден'), { statusCode: 404 });
      if (row.passenger_id !== session.id && !session.roles.includes('admin')) {
        throw Object.assign(new Error('Отменить заказ может только пассажир'), { statusCode: 403 });
      }
      if (!canTransitionRide(row.status, 'cancelled')) {
        throw Object.assign(new Error('Эту поездку уже нельзя отменить'), { statusCode: 409 });
      }

      await connection.execute(
        "UPDATE orders SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(3) WHERE id = ?",
        [id],
      );
      if (row.driver_id) {
        await connection.execute(
          "UPDATE drivers SET status = 'online' WHERE id = ? AND status = 'busy'",
          [row.driver_id],
        );
      }
      await connection.execute('DELETE FROM passenger_locations WHERE order_id = ?', [id]);
      await connection.execute(
        `INSERT INTO order_events
          (order_id, actor_user_id, event_type, from_status, to_status, payload)
         VALUES (?, ?, 'order.cancelled', ?, 'cancelled', ?)`,
        [
          id,
          session.id,
          row.status,
          JSON.stringify({
            initiatedBy: row.passenger_id === session.id ? 'passenger' : 'admin',
          }),
        ],
      );

      let passengerBlocked = false;
      if (row.passenger_id === session.id && !session.roles.includes('admin')) {
        const [countRows] = await connection.query<
          (RowDataPacket & { cancellation_count: number })[]
        >(
          `SELECT COUNT(DISTINCT e.order_id) AS cancellation_count
           FROM order_events e
           JOIN orders o ON o.id = e.order_id
           WHERE o.passenger_id = ?
             AND e.actor_user_id = ?
             AND e.event_type = 'order.cancelled'
             AND e.created_at >= TIMESTAMPADD(
               HOUR, -?, UTC_TIMESTAMP(3)
             )`,
          [
            session.id,
            session.id,
            passengerCancellationPolicy.windowHours,
          ],
        );
        if (
          Number(countRows[0]?.cancellation_count ?? 0) >=
          passengerCancellationPolicy.limit
        ) {
          passengerBlocked = true;
          await connection.execute(
            `UPDATE users
             SET order_blocked_until = TIMESTAMPADD(HOUR, ?, UTC_TIMESTAMP(3)),
               order_block_reason = ?
             WHERE id = ?`,
            [
              passengerCancellationPolicy.blockHours,
              `Частые отмены: ${passengerCancellationPolicy.limit} за ${passengerCancellationPolicy.windowHours} ч.`,
              session.id,
            ],
          );
        }
      }

      return {
        passengerId: row.passenger_id,
        driverId: row.driver_id,
        fromStatus: row.status,
        initiatedBy: row.passenger_id === session.id ? 'passenger' as const : 'admin' as const,
        passengerBlocked,
      };
    });
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${participants.passengerId}`, 'order:updated', payload);
    if (participants.driverId) publish(`driver:${participants.driverId}`, 'order:updated', payload);
    notifyAdmins({
      icon: participants.passengerBlocked ? '🚨' : '❌',
      title: participants.passengerBlocked
        ? 'Заказ отменён — пассажир временно заблокирован'
        : 'Заказ отменён',
      actor: {
        role: participants.initiatedBy === 'passenger' ? 'пассажир' : 'администратор',
        id: session.id,
        name: participants.initiatedBy === 'passenger' ? payload.passenger?.name : undefined,
        phone: participants.initiatedBy === 'passenger' ? payload.passenger?.phone : undefined,
      },
      entity: { label: 'Заказ', id },
      details: [
        ['Предыдущий статус', rideStatusLabels[participants.fromStatus]],
        ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
        ['Стоимость', formatMoney(payload.priceMinor)],
        ['Назначенный водитель', payload.driver?.name],
      ],
    });
    notifyMessengers(
      notifyUsersInMessengers([participants.passengerId], {
        icon: '❌',
        title: 'Заказ отменён',
        body: participants.initiatedBy === 'passenger'
          ? 'Вы отменили заказ.'
          : 'Заказ отменён администратором.',
        details: [
          ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
          ['Статус до отмены', rideStatusLabels[participants.fromStatus]],
          ['Ограничение заказов', participants.passengerBlocked
            ? `на ${passengerCancellationPolicy.blockHours} ч. из-за частых отмен`
            : null],
        ],
        action: { label: 'Мои заказы', url: appUrl('/orders') },
      }),
      'order.cancelled.passenger',
    );
    if (participants.driverId) {
      notifyMessengers(
        notifyDriversInMessengers([participants.driverId], {
          icon: '❌',
          title: 'Заказ отменён',
          body: 'Пассажир или администратор отменил назначенный вам заказ.',
          details: [
            ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
            ['Пассажир', payload.passenger?.name],
          ],
          action: { label: 'Искать новые заказы', url: appUrl('/driver') },
        }),
        'order.cancelled.driver',
      );
    }
    return { data: payload };
  });

  app.put('/v1/passenger/location', async (request) => {
    const session = await auth(request);
    const input = parse(passengerLocationSchema, request.body);
    const order = await getOrder(input.orderId);
    if (!order) {
      throw Object.assign(new Error('Заказ не найден'), { statusCode: 404 });
    }
    if (order.passenger_id !== session.id) {
      throw Object.assign(new Error('Нет доступа к геопозиции заказа'), { statusCode: 403 });
    }
    if (
      !order.driver_id ||
      !['accepted', 'driver_arriving', 'driver_waiting', 'in_progress'].includes(order.status)
    ) {
      throw Object.assign(
        new Error('Геопозиция передаётся только водителю активного заказа'),
        { statusCode: 409 },
      );
    }
    const now = Date.now();
    const lastAcceptedAt = lastPassengerLocationAcceptedAt.get(order.id) ?? 0;
    if (
      liveLocationUpdateDelay(
        lastAcceptedAt,
        now,
        LIVE_LOCATION_UPDATE_INTERVAL_MS,
      ) > 0
    ) {
      return { data: { accepted: true, throttled: true } };
    }
    lastPassengerLocationAcceptedAt.set(order.id, now);
    try {
      await db.execute(
        `INSERT INTO passenger_locations (
          order_id, passenger_id, latitude, longitude, accuracy_meters, recorded_at
        ) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          accuracy_meters = VALUES(accuracy_meters),
          recorded_at = VALUES(recorded_at)`,
        [
          order.id,
          session.id,
          input.latitude,
          input.longitude,
          input.accuracyMeters ?? null,
        ],
      );
    } catch (error) {
      if (lastPassengerLocationAcceptedAt.get(order.id) === now) {
        lastPassengerLocationAcceptedAt.delete(order.id);
      }
      throw error;
    }
    const coordinates = {
      latitude: input.latitude,
      longitude: input.longitude,
    };
    publish(`driver:${order.driver_id}`, 'passenger:location', {
      orderId: order.id,
      coordinates,
    });
    return { data: { accepted: true } };
  });

  app.delete('/v1/passenger/location/:orderId', async (request) => {
    const session = await auth(request);
    const { orderId } = parse(
      z.object({ orderId: z.string().uuid() }),
      request.params,
    );
    const order = await getOrder(orderId);
    if (!order) return { data: { removed: true } };
    if (order.passenger_id !== session.id) {
      throw Object.assign(new Error('Нет доступа к геопозиции заказа'), { statusCode: 403 });
    }
    await db.execute(
      'DELETE FROM passenger_locations WHERE order_id = ? AND passenger_id = ?',
      [orderId, session.id],
    );
    lastPassengerLocationAcceptedAt.delete(orderId);
    if (order.driver_id) {
      publish(`driver:${order.driver_id}`, 'passenger:location', {
        orderId,
        coordinates: null,
      });
    }
    return { data: { removed: true } };
  });

  app.post('/v1/driver/status', async (request) => {
    const session = await auth(request, 'driver');
    const { status } = parse(z.object({ status: z.enum(['online', 'offline']) }), request.body);
    const driver = await getDriver(session.id);
    if (!driver) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    if (driver.status === 'suspended') {
      throw Object.assign(new Error('Доступ водителя приостановлен'), { statusCode: 403 });
    }
    if (driver.status === 'busy' && status === 'offline') {
      throw Object.assign(new Error('Нельзя завершить смену во время активной поездки'), {
        statusCode: 409,
        code: 'ACTIVE_RIDE_IN_PROGRESS',
      });
    }
    await db.execute(
      "UPDATE drivers SET status = ? WHERE id = ? AND status <> 'suspended'",
      [status, driver.id],
    );
    if (status === 'online') {
      await openDriverShift(driver.id);
      publish('drivers', 'driver:online', { driverId: driver.id });
    } else {
      await closeDriverShift(driver.id);
    }
    if (driver.status !== status) {
      notifyAdmins({
        icon: status === 'online' ? '🟢' : '⚫',
        title: status === 'online' ? 'Водитель вышел на линию' : 'Водитель ушёл с линии',
        actor: { role: 'водитель', id: session.id },
        entity: { label: 'Водитель', id: driver.id },
        details: [['Предыдущий статус', driver.status]],
      });
    }
    return { data: { status } };
  });

  app.get('/v1/driver/profile', async (request) => {
    const session = await auth(request, 'driver');
    const row = await firstRow<
      RowDataPacket & {
        id: string;
        name: string;
        phone: string | null;
        status: string;
        rating: number;
        hasChildSeat: number;
        make: string | null;
        model: string | null;
        year: number | null;
        color: string | null;
        colorHex: string | null;
        plate: string | null;
      }
    >(
      `SELECT d.id, u.name, u.phone, d.status, d.rating,
        d.has_child_seat AS hasChildSeat, v.make, v.model, v.year, v.color,
        v.color_hex AS colorHex, v.plate
       FROM drivers d JOIN users u ON u.id = d.user_id
       LEFT JOIN vehicles v ON v.driver_id = d.id AND v.active = TRUE
       WHERE d.user_id = ? LIMIT 1`,
      [session.id],
    );
    if (!row) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    return { data: { ...row, hasChildSeat: Boolean(row.hasChildSeat) } };
  });

  app.get('/v1/driver/vehicle-change-requests/me', async (request) => {
    const session = await auth(request, 'driver');
    const driver = await getDriver(session.id);
    if (!driver) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    const [rows] = await db.query<VehicleChangeRow[]>(
      `${vehicleChangeSelect}
       WHERE r.driver_id = ?
       ORDER BY r.created_at DESC`,
      [driver.id],
    );
    return { data: rows.map(presentVehicleChangeRequest) };
  });

  app.post('/v1/driver/vehicle-change-requests', async (request, reply) => {
    const session = await auth(request, 'driver');
    const input = parse(vehicleDetailsSchema, request.body);
    const driver = await getDriver(session.id);
    if (!driver?.vehicle_id) {
      throw Object.assign(new Error('Активный автомобиль не найден'), { statusCode: 404 });
    }
    const pending = await firstRow<RowDataPacket & { id: string }>(
      "SELECT id FROM vehicle_change_requests WHERE driver_id = ? AND status = 'pending' LIMIT 1",
      [driver.id],
    );
    if (pending) {
      throw Object.assign(new Error('Изменение автомобиля уже находится на проверке'), {
        statusCode: 409,
        code: 'PENDING_VEHICLE_CHANGE_EXISTS',
      });
    }
    const current = await firstRow<
      RowDataPacket & {
        make: string;
        model: string;
        year: number;
        color: string;
        color_hex: string;
        plate: string;
        has_child_seat: number;
      }
    >(
      `SELECT v.make, v.model, v.year, v.color, v.color_hex, v.plate, d.has_child_seat
       FROM vehicles v JOIN drivers d ON d.id = v.driver_id
       WHERE v.id = ? AND v.active = TRUE`,
      [driver.vehicle_id],
    );
    if (!current) throw Object.assign(new Error('Активный автомобиль не найден'), { statusCode: 404 });
    const normalizedPlate = input.plate.toUpperCase();
    const duplicatePlate = await firstRow<RowDataPacket & { id: string }>(
      `SELECT id FROM vehicles
       WHERE active = TRUE AND plate = ? AND driver_id <> ? LIMIT 1`,
      [normalizedPlate, driver.id],
    );
    if (duplicatePlate) {
      throw Object.assign(new Error('Этот госномер уже используется другим водителем'), {
        statusCode: 409,
        code: 'PLATE_ALREADY_EXISTS',
      });
    }
    const unchanged =
      current.make === input.vehicleMake &&
      current.model === input.vehicleModel &&
      Number(current.year) === input.vehicleYear &&
      current.color === input.vehicleColor &&
      current.color_hex.toUpperCase() === input.vehicleColorHex.toUpperCase() &&
      current.plate === normalizedPlate &&
      Boolean(current.has_child_seat) === input.hasChildSeat;
    if (unchanged) {
      throw Object.assign(new Error('Измените хотя бы одно поле'), {
        statusCode: 400,
        code: 'NO_VEHICLE_CHANGES',
      });
    }

    const id = randomUUID();
    await db.execute(
      `INSERT INTO vehicle_change_requests (
        id, driver_id, current_vehicle_id, vehicle_make, vehicle_model, vehicle_year,
        vehicle_color, vehicle_color_hex, plate, has_child_seat, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        id,
        driver.id,
        driver.vehicle_id,
        input.vehicleMake,
        input.vehicleModel,
        input.vehicleYear,
        input.vehicleColor,
        input.vehicleColorHex.toUpperCase(),
        normalizedPlate,
        input.hasChildSeat,
      ],
    );
    const created = await firstRow<VehicleChangeRow>(
      `${vehicleChangeSelect} WHERE r.id = ?`,
      [id],
    );
    publish('admins', 'vehicle-change:created', { id, driverId: driver.id });
    notifyAdmins({
      icon: '🚘',
      title: 'Водитель запросил смену автомобиля',
      actor: { role: 'водитель', id: session.id },
      entity: { label: 'Заявка', id },
      details: [
        ['Водитель', driver.id],
        ['Было', `${current.make} ${current.model}, ${current.plate}`],
        ['Станет', `${input.vehicleMake} ${input.vehicleModel}, ${normalizedPlate}`],
        ['Цвет', input.vehicleColor],
        ['Детское кресло', input.hasChildSeat ? 'есть' : 'нет'],
      ],
    });
    notifyMessengers(
      notifyUsersInMessengers([session.id], {
        icon: '🕓',
        title: 'Заявка на смену автомобиля принята',
        body: 'Администратор проверит новые данные. О результате сообщим здесь.',
        details: [
          ['Автомобиль', `${input.vehicleMake} ${input.vehicleModel}`],
          ['Госномер', normalizedPlate],
        ],
        action: { label: 'Открыть профиль', url: appUrl('/driver/profile') },
      }),
      'vehicle-change.created',
    );
    reply.code(201);
    return { data: created ? presentVehicleChangeRequest(created) : { id, status: 'pending' } };
  });

  app.put('/v1/driver/location', async (request) => {
    const session = await auth(request, 'driver');
    const input = parse(pointSchema.extend({ accuracyMeters: z.number().min(0).max(10_000).optional() }), request.body);
    const driver = await getDriver(session.id);
    if (!driver) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    if (!['online', 'busy'].includes(driver.status)) {
      throw Object.assign(new Error('Геолокация принимается только во время смены'), { statusCode: 409 });
    }
    const now = Date.now();
    const lastAcceptedAt = lastDriverLocationAcceptedAt.get(driver.id) ?? 0;
    if (
      liveLocationUpdateDelay(
        lastAcceptedAt,
        now,
        LIVE_LOCATION_UPDATE_INTERVAL_MS,
      ) > 0
    ) {
      return { data: { accepted: true, throttled: true } };
    }
    lastDriverLocationAcceptedAt.set(driver.id, now);
    try {
      await db.execute(
        `INSERT INTO driver_locations (driver_id, latitude, longitude, accuracy_meters, recorded_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude),
           accuracy_meters = VALUES(accuracy_meters), recorded_at = VALUES(recorded_at)`,
        [driver.id, input.latitude, input.longitude, input.accuracyMeters ?? null],
      );
    } catch (error) {
      if (lastDriverLocationAcceptedAt.get(driver.id) === now) {
        lastDriverLocationAcceptedAt.delete(driver.id);
      }
      throw error;
    }
    publish(`driver:${driver.id}`, 'driver:location', input);
    const activeOrder = await firstRow<RowDataPacket & { passenger_id: string }>(
      `SELECT passenger_id FROM orders
       WHERE driver_id = ? AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')
       ORDER BY created_at DESC LIMIT 1`,
      [driver.id],
    );
    if (activeOrder) publish(`user:${activeOrder.passenger_id}`, 'driver:location', input);
    return { data: { accepted: true } };
  });

  app.post(
    '/v1/driver/orders/:id/route',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await auth(request, 'driver');
      const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
      const origin = parse(pointSchema, request.body);
      const driver = await getDriver(session.id);
      const order = await getOrder(id);
      if (!driver || !order || order.driver_id !== driver.id) {
        throw Object.assign(new Error('Заказ водителя не найден'), { statusCode: 404 });
      }
      const targetKind = driverRouteTarget(order.status);
      if (!targetKind) {
        throw Object.assign(new Error('Навигация доступна только для активного заказа'), {
          statusCode: 409,
          code: 'NAVIGATION_NOT_ACTIVE',
        });
      }
      const target =
        targetKind === 'pickup'
          ? { latitude: Number(order.pickup_lat), longitude: Number(order.pickup_lon) }
          : {
              latitude: Number(order.destination_lat),
              longitude: Number(order.destination_lon),
            };
      return {
        data: {
          ...(await getRouteMetrics(origin, target)),
          target: targetKind,
        },
      };
    },
  );

  app.get('/v1/driver/offers', async (request) => {
    const session = await auth(request, 'driver');
    const driver = await getDriver(session.id);
    if (!driver) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    if (driver.status !== 'online') return { data: [] };
    const [rows] = await db.query<OrderRow[]>(
      `${orderSelect}
       WHERE o.status = 'searching' AND o.driver_id IS NULL
         AND (o.tariff <> 'child' OR EXISTS (
           SELECT 1 FROM drivers eligible WHERE eligible.id = ? AND eligible.has_child_seat = TRUE
         ))
       ORDER BY o.created_at ASC LIMIT 20`,
      [driver.id],
    );
    return { data: rows.map(presentOrder) };
  });

  app.post('/v1/driver/orders/:id/accept', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = request.params as { id: string };
    const updated = await withTransaction(async (connection) => {
      const driver = await getDriver(session.id, connection);
      if (!driver?.vehicle_id) {
        throw Object.assign(new Error('Добавьте активный автомобиль'), { statusCode: 409 });
      }
      if (driver.status !== 'online') {
        throw Object.assign(new Error('Включите статус «На линии»'), { statusCode: 409 });
      }
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!row || row.status !== 'searching' || row.driver_id) {
        throw Object.assign(new Error('Заказ уже взял другой водитель'), {
          statusCode: 409,
          code: 'ORDER_ALREADY_TAKEN',
        });
      }
      if (row.tariff === 'child') {
        const [eligibleRows] = await connection.query<(RowDataPacket & { has_child_seat: number })[]>(
          'SELECT has_child_seat FROM drivers WHERE id = ?',
          [driver.id],
        );
        if (!eligibleRows[0]?.has_child_seat) {
          throw Object.assign(new Error('Для детского тарифа нужно детское кресло'), { statusCode: 409 });
        }
      }
      const rules = await pricingRules(connection);
      const commissionBps = driver.commission_bps ?? rules.serviceCommissionBps;
      const commissionMinor = calculateCommissionMinor(row.price_minor, commissionBps);
      await connection.execute(
        `UPDATE orders SET driver_id = ?, vehicle_id = ?, status = 'accepted',
          commission_minor = ?, commission_bps = ?
         WHERE id = ? AND status = 'searching'`,
        [driver.id, driver.vehicle_id, commissionMinor, commissionBps, id],
      );
      await connection.execute("UPDATE drivers SET status = 'busy' WHERE id = ?", [driver.id]);
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, from_status, to_status)
         VALUES (?, ?, 'order.accepted', 'searching', 'accepted')`,
        [id, session.id],
      );
      return { passengerId: row.passenger_id, driverId: driver.id };
    });
    const row = await getOrder(id);
    if (!row) throw new Error('Order disappeared');
    const payload = presentOrder(row);
    publish(`user:${updated.passengerId}`, 'order:updated', payload);
    publish(`driver:${updated.driverId}`, 'order:updated', payload);
    notifyAdmins({
      icon: '✅',
      title: 'Водитель принял заказ',
      actor: {
        role: 'водитель',
        id: session.id,
        name: payload.driver?.name,
        phone: payload.driver?.phone,
      },
      entity: { label: 'Заказ', id },
      details: [
        ['Водитель', updated.driverId],
        ['Автомобиль', payload.driver
          ? `${payload.driver.vehicle.make} ${payload.driver.vehicle.model}, ${payload.driver.vehicle.plate}`
          : null],
        ['Пассажир', payload.passenger?.name],
        ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
        ['Стоимость', formatMoney(payload.priceMinor)],
      ],
    });
    void notifyUsers([updated.passengerId], {
      title: 'Водитель найден',
      body: `${payload.driver?.vehicle.color ?? ''} ${payload.driver?.vehicle.make ?? ''} · ${payload.driver?.vehicle.plate ?? ''}`.trim(),
      data: { orderId: id },
      sound: 'taxi_found.wav',
      channelId: 'ride-taxi-found-v2',
    }).catch((error) => app.log.warn({ error }, 'push notification failed'));
    notifyMessengers(
      notifyUsersInMessengers([updated.passengerId], {
        icon: '✅',
        title: 'Машина найдена',
        body: payload.driver
          ? `${payload.driver.name} едет к вам на ${payload.driver.vehicle.color.toLowerCase()} ${payload.driver.vehicle.make}.`
          : 'Водитель принял ваш заказ и скоро выедет к месту подачи.',
        details: [
          ['Госномер', payload.driver?.vehicle.plate],
          ['Телефон водителя', payload.driver?.phone],
          ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
        ],
        action: { label: 'Следить за поездкой', url: appUrl(`/orders/${id}`) },
      }),
      'order.accepted.passenger',
    );
    notifyMessengers(
      notifyUsersInMessengers([session.id], {
        icon: '✅',
        title: 'Заказ принят',
        body: `Подача: ${payload.pickup.label}`,
        details: [
          ['Куда', payload.destination.label],
          ['Пассажир', payload.passenger?.name],
          ['Телефон пассажира', payload.passenger?.phone],
          ['Стоимость', formatMoney(payload.priceMinor)],
          ['Комментарий', payload.comment],
        ],
        action: { label: 'Открыть поездку', url: appUrl('/driver') },
      }),
      'order.accepted.driver',
    );
    return { data: payload };
  });

  app.post('/v1/driver/orders/:id/waiting/start', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = request.params as { id: string };
    const participants = await withTransaction(async (connection) => {
      const driver = await getDriver(session.id, connection);
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!driver || !row || row.driver_id !== driver.id) {
        throw Object.assign(new Error('Заказ водителя не найден'), { statusCode: 404 });
      }
      if (row.status !== 'in_progress') {
        throw Object.assign(
          new Error('Ожидание можно включить только во время поездки'),
          { statusCode: 409, code: 'WAITING_NOT_AVAILABLE' },
        );
      }
      const changed = !row.waiting_started_at;
      if (!row.waiting_started_at) {
        await connection.execute(
          'UPDATE orders SET waiting_started_at = UTC_TIMESTAMP(3) WHERE id = ?',
          [id],
        );
        await connection.execute(
          `INSERT INTO order_events (order_id, actor_user_id, event_type, payload)
           VALUES (?, ?, 'waiting.started', ?)`,
          [
            id,
            session.id,
            JSON.stringify({
              freeMinutes: row.waiting_free_minutes,
              perMinuteMinor: row.waiting_per_minute_minor,
            }),
          ],
        );
      }
      return { passengerId: row.passenger_id, driverId: driver.id, changed };
    });
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${participants.passengerId}`, 'order:updated', payload);
    publish(`driver:${participants.driverId}`, 'order:updated', payload);
    if (participants.changed) {
      notifyAdmins({
        icon: '⏱️',
        title: 'Водитель включил платное ожидание',
        actor: { role: 'водитель', id: session.id, name: payload.driver?.name },
        entity: { label: 'Заказ', id },
        details: [
          ['Бесплатно', `${payload.waitingFreeMinutes ?? 0} мин.`],
          ['Далее', `${formatMoney(payload.waitingPerMinuteMinor ?? 0)} / мин.`],
        ],
      });
      notifyMessengers(
        notifyUsersInMessengers([participants.passengerId], {
          icon: '⏱️',
          title: 'Включено платное ожидание',
          body: 'Водитель включил счётчик ожидания во время поездки.',
          details: [
            ['Бесплатно', `${payload.waitingFreeMinutes ?? 0} мин.`],
            ['Далее', `${formatMoney(payload.waitingPerMinuteMinor ?? 0)} / мин.`],
          ],
          action: { label: 'Открыть поездку', url: appUrl(`/orders/${id}`) },
        }),
        'waiting.started.passenger',
      );
    }
    return { data: payload };
  });

  app.post('/v1/driver/orders/:id/waiting/stop', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = request.params as { id: string };
    const participants = await withTransaction(async (connection) => {
      const driver = await getDriver(session.id, connection);
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!driver || !row || row.driver_id !== driver.id) {
        throw Object.assign(new Error('Заказ водителя не найден'), { statusCode: 404 });
      }
      if (row.status !== 'in_progress') {
        throw Object.assign(
          new Error('Ожидание можно завершить только во время поездки'),
          { statusCode: 409, code: 'WAITING_NOT_AVAILABLE' },
        );
      }
      let settled: Awaited<ReturnType<typeof settleWaiting>> | null = null;
      if (row.waiting_started_at) {
        settled = await settleWaiting(connection, row);
        await connection.execute(
          `INSERT INTO order_events (order_id, actor_user_id, event_type, payload)
           VALUES (?, ?, 'waiting.stopped', ?)`,
          [id, session.id, JSON.stringify(settled)],
        );
      }
      return { passengerId: row.passenger_id, driverId: driver.id, settled };
    });
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${participants.passengerId}`, 'order:updated', payload);
    publish(`driver:${participants.driverId}`, 'order:updated', payload);
    if (participants.settled) {
      notifyAdmins({
        icon: '⏹️',
        title: 'Водитель завершил платное ожидание',
        actor: { role: 'водитель', id: session.id, name: payload.driver?.name },
        entity: { label: 'Заказ', id },
        details: [
          ['Ожидание', `${Math.ceil(participants.settled.waitingSeconds / 60)} мин.`],
          ['Начислено', formatMoney(participants.settled.waitingPriceMinor)],
          ['Итого по заказу', formatMoney(participants.settled.priceMinor)],
        ],
      });
      notifyMessengers(
        notifyUsersInMessengers([participants.passengerId], {
          icon: '⏹️',
          title: 'Платное ожидание завершено',
          body: 'Счётчик ожидания остановлен, стоимость заказа обновлена.',
          details: [
            ['Ожидание', `${Math.ceil(participants.settled.waitingSeconds / 60)} мин.`],
            ['Начислено', formatMoney(participants.settled.waitingPriceMinor)],
            ['Итого', formatMoney(participants.settled.priceMinor)],
          ],
          action: { label: 'Открыть поездку', url: appUrl(`/orders/${id}`) },
        }),
        'waiting.stopped.passenger',
      );
    }
    return { data: payload };
  });

  app.post('/v1/driver/orders/:id/transition', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = request.params as { id: string };
    const { status } = parse(
      z.object({ status: z.enum(['driver_arriving', 'driver_waiting', 'in_progress', 'completed']) }),
      request.body,
    );
    const driver = await getDriver(session.id);
    const row = await getOrder(id);
    if (!driver || !row || row.driver_id !== driver.id) {
      throw Object.assign(new Error('Заказ водителя не найден'), { statusCode: 404 });
    }
    if (!canTransitionRide(row.status, status)) {
      throw Object.assign(new Error('Недопустимый переход статуса'), {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }
    if (status === 'completed' && row.waiting_started_at) {
      await withTransaction(async (connection) => {
        const [waitingRows] = await connection.query<OrderRow[]>(
          'SELECT * FROM orders WHERE id = ? FOR UPDATE',
          [id],
        );
        const waitingRow = waitingRows[0];
        if (waitingRow?.waiting_started_at) {
          await settleWaiting(connection, waitingRow);
        }
      });
    }
    const [result] = await db.execute(
      `UPDATE orders SET status = ?, completed_at = IF(? = 'completed', UTC_TIMESTAMP(3), completed_at)
       WHERE id = ? AND status = ?`,
      [status, status, id, row.status],
    );
    if ((result as { affectedRows: number }).affectedRows !== 1) {
      throw Object.assign(new Error('Статус заказа уже изменился'), { statusCode: 409 });
    }
    await db.execute(
      `INSERT INTO order_events (order_id, actor_user_id, event_type, from_status, to_status)
       VALUES (?, ?, 'order.transition', ?, ?)`,
      [id, session.id, row.status, status],
    );
    if (status === 'completed') {
      await db.execute(
        "UPDATE drivers SET status = 'online' WHERE id = ? AND status = 'busy'",
        [driver.id],
      );
      await db.execute('DELETE FROM passenger_locations WHERE order_id = ?', [id]);
    }
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${row.passenger_id}`, 'order:updated', payload);
    publish(`driver:${driver.id}`, 'order:updated', payload);
    notifyAdmins({
      icon:
        status === 'completed'
          ? '🏁'
          : status === 'driver_waiting'
            ? '📍'
            : status === 'in_progress'
              ? '▶️'
              : '🚗',
      title: {
        driver_arriving: 'Водитель выехал к пассажиру',
        driver_waiting: 'Водитель прибыл на место подачи',
        in_progress: 'Поездка началась',
        completed: 'Поездка завершена',
      }[status],
      actor: {
        role: 'водитель',
        id: session.id,
        name: payload.driver?.name,
        phone: payload.driver?.phone,
      },
      entity: { label: 'Заказ', id },
      details: [
        ['Статус', rideStatusLabels[status]],
        ['Пассажир', payload.passenger?.name],
        ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
        ['Стоимость', status === 'completed' ? formatMoney(payload.priceMinor) : null],
        ['Ожидание', status === 'completed' && (payload.waitingPriceMinor ?? 0) > 0
          ? formatMoney(payload.waitingPriceMinor ?? 0)
          : null],
        ['Комиссия сервиса', status === 'completed'
          ? formatMoney(payload.serviceCommissionMinor)
          : null],
      ],
    });
    const notification =
      status === 'driver_waiting'
        ? {
            title: 'Водитель приехал',
            body: 'Машина ожидает в месте подачи',
            sound: 'driver_arrived.wav',
            channelId: 'ride-driver-arrived-v2' as const,
          }
        : status === 'completed'
          ? {
              title: 'Поездка завершена',
              body: 'Спасибо, что выбрали Такси Грахово',
              sound: 'ride_complete.wav',
              channelId: 'ride-complete-v2' as const,
            }
          : null;
    if (notification) {
      void notifyUsers([row.passenger_id], { ...notification, data: { orderId: id } }).catch((error) =>
        app.log.warn({ error }, 'push notification failed'),
      );
    }
    const passengerMessengerNotification: Omit<PersonalMessengerNotification, 'action'> = ({
      driver_arriving: {
        icon: '🚗',
        title: 'Водитель выехал к вам',
        body: 'Машина направляется к месту подачи.',
        details: [
          ['Машина', payload.driver
            ? `${payload.driver.vehicle.color} ${payload.driver.vehicle.make}`
            : null],
          ['Госномер', payload.driver?.vehicle.plate],
        ],
      },
      driver_waiting: {
        icon: '📍',
        title: 'Машина приехала',
        body: 'Водитель ожидает вас в месте подачи.',
        details: [
          ['Место подачи', payload.pickup.label],
          ['Госномер', payload.driver?.vehicle.plate],
          ['Телефон водителя', payload.driver?.phone],
        ],
      },
      in_progress: {
        icon: '▶️',
        title: 'Поездка началась',
        body: `Направляемся в ${payload.destination.label}.`,
        details: [['Стоимость', formatMoney(payload.priceMinor)]],
      },
      completed: {
        icon: '🏁',
        title: 'Поездка завершена',
        body: 'Спасибо, что выбрали Такси Грахово!',
        details: [
          ['Маршрут', `${payload.pickup.label} → ${payload.destination.label}`],
          ['Итого', formatMoney(payload.priceMinor)],
          ['В том числе ожидание', payload.waitingPriceMinor
            ? formatMoney(payload.waitingPriceMinor)
            : null],
        ],
      },
    } satisfies Record<typeof status, Omit<PersonalMessengerNotification, 'action'>>)[status];
    notifyMessengers(
      notifyUsersInMessengers([row.passenger_id], {
        ...passengerMessengerNotification,
        action: { label: 'Открыть поездку', url: appUrl(`/orders/${id}`) },
      }),
      `order.${status}.passenger`,
    );
    if (status === 'completed') {
      notifyMessengers(
        notifyUsersInMessengers([session.id], {
          icon: '🏁',
          title: 'Заказ завершён',
          body: `${payload.pickup.label} → ${payload.destination.label}`,
          details: [
            ['Стоимость', formatMoney(payload.priceMinor)],
            ['Комиссия', formatMoney(payload.serviceCommissionMinor)],
            ['Ваш доход', formatMoney(payload.priceMinor - payload.serviceCommissionMinor)],
          ],
          action: { label: 'Открыть поездки', url: appUrl('/driver/trips') },
        }),
        'order.completed.driver',
      );
    }
    return { data: payload };
  });

  app.get('/v1/driver/earnings', async (request) => {
    const session = await auth(request, 'driver');
    const driver = await getDriver(session.id);
    if (!driver) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    const { period = 'today' } = request.query as { period?: 'today' | 'week' | 'month' };
    const interval = period === 'month' ? '30 DAY' : period === 'week' ? '7 DAY' : '1 DAY';
    const row = await firstRow<
      RowDataPacket & { gross: number; commission: number; rides: number }
    >(
      `SELECT COALESCE(SUM(price_minor), 0) AS gross,
        COALESCE(SUM(commission_minor), 0) AS commission, COUNT(*) AS rides
       FROM orders WHERE driver_id = ? AND status = 'completed'
         AND completed_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${interval})`,
      [driver.id],
    );
    const gross = row?.gross ?? 0;
    const commission = row?.commission ?? 0;
    const shift = await firstRow<RowDataPacket & { onlineSeconds: number }>(
      `SELECT COALESCE(SUM(
         TIMESTAMPDIFF(
           SECOND,
           GREATEST(started_at, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${interval})),
           LEAST(COALESCE(ended_at, UTC_TIMESTAMP(3)), UTC_TIMESTAMP(3))
         )
       ), 0) AS onlineSeconds
       FROM driver_shifts
       WHERE driver_id = ?
         AND started_at < UTC_TIMESTAMP(3)
         AND COALESCE(ended_at, UTC_TIMESTAMP(3)) >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${interval})`,
      [driver.id],
    );
    return {
      data: {
        period,
        grossMinor: gross,
        commissionMinor: commission,
        netMinor: gross - commission,
        rides: row?.rides ?? 0,
        onlineMinutes: Math.max(0, Math.floor(Number(shift?.onlineSeconds ?? 0) / 60)),
      },
    };
  });

  app.post('/v1/driver-applications', async (request, reply) => {
    const session = await auth(request, 'passenger');
    const input = parse(applicationSchema, request.body);
    const existingDriver = await getDriver(session.id);
    if (existingDriver) {
      throw Object.assign(new Error('Профиль водителя уже создан'), {
        statusCode: 409,
        code: 'DRIVER_ALREADY_EXISTS',
      });
    }
    const pendingApplication = await firstRow<RowDataPacket & { id: string }>(
      "SELECT id FROM driver_applications WHERE user_id = ? AND status = 'pending' LIMIT 1",
      [session.id],
    );
    if (pendingApplication) {
      throw Object.assign(new Error('Заявка уже находится на проверке'), {
        statusCode: 409,
        code: 'PENDING_APPLICATION_EXISTS',
      });
    }
    const id = randomUUID();
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO driver_applications (
          id, user_id, applicant_name, phone, license_number, vehicle_make, vehicle_model,
          vehicle_year, vehicle_color, vehicle_color_hex, plate, has_child_seat, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          id,
          session.id,
          input.applicantName,
          input.phone,
          input.licenseNumber,
          input.vehicleMake,
          input.vehicleModel,
          input.vehicleYear,
          input.vehicleColor,
          input.vehicleColorHex.toUpperCase(),
          input.plate.toUpperCase(),
          input.hasChildSeat,
        ],
      );
      await recordDriverConsents(connection, session.id, input.legalAcceptance, {
        source: 'driver_application',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
    });
    publish('admins', 'application:created', { id });
    notifyAdmins({
      icon: '🪪',
      title: 'Подана заявка в водители',
      actor: {
        role: 'пассажир',
        id: session.id,
        name: input.applicantName,
        phone: input.phone,
      },
      entity: { label: 'Заявка', id },
      details: [
        ['Водительское удостоверение', input.licenseNumber],
        ['Автомобиль', `${input.vehicleMake} ${input.vehicleModel}, ${input.vehicleYear}`],
        ['Цвет', input.vehicleColor],
        ['Госномер', input.plate.toUpperCase()],
        ['Детское кресло', input.hasChildSeat ? 'есть' : 'нет'],
      ],
    });
    notifyMessengers(
      notifyUsersInMessengers([session.id], {
        icon: '🕓',
        title: 'Заявка в водители принята',
        body: 'Администратор проверит документы и автомобиль. О результате сообщим здесь.',
        details: [
          ['Автомобиль', `${input.vehicleMake} ${input.vehicleModel}`],
          ['Госномер', input.plate.toUpperCase()],
        ],
        action: { label: 'Посмотреть заявку', url: appUrl('/driver-application') },
      }),
      'application.created',
    );
    reply.code(201);
    return { data: { id, status: 'pending' } };
  });

  app.get('/v1/driver-applications/me', async (request) => {
    const session = await auth(request, 'passenger');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, user_id AS userId, applicant_name AS applicantName, phone,
        license_number AS licenseNumber, vehicle_make AS vehicleMake,
        vehicle_model AS vehicleModel, vehicle_year AS vehicleYear,
        vehicle_color AS vehicleColor, vehicle_color_hex AS vehicleColorHex,
        plate, has_child_seat AS hasChildSeat,
        status, moderation_comment AS moderationComment, created_at AS createdAt
       FROM driver_applications WHERE user_id = ? ORDER BY created_at DESC`,
      [session.id],
    );
    return { data: rows };
  });

  app.get('/v1/admin/metrics', async (request) => {
    await auth(request, 'admin');
    const [rows] = await db.query<(RowDataPacket & { key_name: string; value: number })[]>(
      `SELECT 'activeOrders' key_name, COUNT(*) value FROM orders
        WHERE status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress')
       UNION ALL SELECT 'onlineDrivers', COUNT(*) FROM drivers WHERE status = 'online'
       UNION ALL SELECT 'pendingApplications',
         (SELECT COUNT(*) FROM driver_applications WHERE status = 'pending') +
         (SELECT COUNT(*) FROM vehicle_change_requests WHERE status = 'pending')
       UNION ALL SELECT 'grossTodayMinor', COALESCE(SUM(price_minor), 0) FROM orders
        WHERE status = 'completed' AND completed_at >= UTC_DATE()
       UNION ALL SELECT 'commissionTodayMinor', COALESCE(SUM(commission_minor), 0) FROM orders
        WHERE status = 'completed' AND completed_at >= UTC_DATE()`,
    );
    return { data: Object.fromEntries(rows.map((row) => [row.key_name, Number(row.value)])) };
  });

  app.get('/v1/admin/applications', async (request) => {
    await auth(request, 'admin');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, user_id AS userId, applicant_name AS applicantName, phone,
        license_number AS licenseNumber, vehicle_make AS vehicleMake,
        vehicle_model AS vehicleModel, vehicle_year AS vehicleYear,
        vehicle_color AS vehicleColor, vehicle_color_hex AS vehicleColorHex,
        plate, has_child_seat AS hasChildSeat,
        status, moderation_comment AS moderationComment, created_at AS createdAt
       FROM driver_applications
       ORDER BY FIELD(status, "pending", "draft", "approved", "rejected"), created_at DESC`,
    );
    return { data: rows };
  });

  app.post('/v1/admin/applications/:id/moderate', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = request.params as { id: string };
    const input = parse(
      z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().max(1000).optional() }),
      request.body,
    );
    const changed = await withTransaction(async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          user_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_year: number;
          vehicle_color: string;
          vehicle_color_hex: string;
          plate: string;
          has_child_seat: number;
          status: string;
        })[]
      >('SELECT * FROM driver_applications WHERE id = ? FOR UPDATE', [id]);
      const application = rows[0];
      if (!application || application.status !== 'pending') {
        throw Object.assign(new Error('Заявка уже рассмотрена или не найдена'), { statusCode: 409 });
      }
      await connection.execute(
        `UPDATE driver_applications SET status = ?, moderation_comment = ?,
          moderated_by = ?, moderated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [input.decision, input.comment ?? null, session.id, id],
      );
      if (input.decision === 'approved') {
        const [plateRows] = await connection.query<(RowDataPacket & { id: string })[]>(
          'SELECT id FROM vehicles WHERE active = TRUE AND plate = ? LIMIT 1 FOR UPDATE',
          [application.plate],
        );
        if (plateRows[0]) {
          throw Object.assign(new Error('Этот госномер уже используется другим водителем'), {
            statusCode: 409,
            code: 'PLATE_ALREADY_EXISTS',
          });
        }
        const driverId = randomUUID();
        await connection.execute(
          `INSERT INTO drivers (id, user_id, has_child_seat)
           VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE has_child_seat = VALUES(has_child_seat)`,
          [driverId, application.user_id, application.has_child_seat],
        );
        const [drivers] = await connection.query<(RowDataPacket & { id: string })[]>(
          'SELECT id FROM drivers WHERE user_id = ?',
          [application.user_id],
        );
        const actualDriverId = drivers[0]!.id;
        await connection.execute(
          `INSERT INTO vehicles (id, driver_id, make, model, year, color, color_hex, plate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE driver_id = VALUES(driver_id), make = VALUES(make),
             model = VALUES(model), year = VALUES(year), color = VALUES(color),
             color_hex = VALUES(color_hex), active = TRUE`,
          [
            randomUUID(),
            actualDriverId,
            application.vehicle_make,
            application.vehicle_model,
            application.vehicle_year,
            application.vehicle_color,
            application.vehicle_color_hex,
            application.plate,
          ],
        );
        await connection.execute(
          "INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'driver')",
          [application.user_id],
        );
      }
      return { userId: application.user_id, before: application.status, after: input.decision };
    });
    await audit(session.id, 'application.moderate', 'driver_application', id, changed.before, changed.after, request.ip);
    publish(`user:${changed.userId}`, 'application:updated', { id, status: input.decision });
    const applicationNotification = {
      title: input.decision === 'approved' ? 'Заявка одобрена' : 'Заявка требует внимания',
      body:
        input.decision === 'approved'
          ? 'Кабинет водителя уже доступен'
          : input.comment || 'Откройте профиль, чтобы увидеть результат проверки',
    };
    void notifyUsers([changed.userId], {
      ...applicationNotification,
      data: { applicationId: id },
    }).catch((error) => app.log.warn({ error }, 'push notification failed'));
    notifyMessengers(
      notifyUsersInMessengers([changed.userId], {
        icon: input.decision === 'approved' ? '🎉' : '⚠️',
        title: applicationNotification.title,
        body: applicationNotification.body,
        details: [['Комментарий администратора', input.comment]],
        action: {
          label: input.decision === 'approved' ? 'Открыть кабинет водителя' : 'Посмотреть заявку',
          url: appUrl(input.decision === 'approved' ? '/driver' : '/driver-application'),
        },
      }),
      'application.moderated',
    );
    return { data: { id, status: input.decision } };
  });

  app.get('/v1/admin/vehicle-change-requests', async (request) => {
    await auth(request, 'admin');
    const [rows] = await db.query<VehicleChangeRow[]>(
      `${vehicleChangeSelect}
       ORDER BY FIELD(r.status, 'pending', 'approved', 'rejected'), r.created_at DESC`,
    );
    return { data: rows.map(presentVehicleChangeRequest) };
  });

  app.post('/v1/admin/vehicle-change-requests/:id/moderate', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = request.params as { id: string };
    const input = parse(
      z.object({
        decision: z.enum(['approved', 'rejected']),
        comment: z.string().trim().max(1000).optional(),
      }),
      request.body,
    );
    const changed = await withTransaction(async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          driver_id: string;
          current_vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_year: number;
          vehicle_color: string;
          vehicle_color_hex: string;
          plate: string;
          has_child_seat: number;
          status: string;
          user_id: string;
        })[]
      >(
        `SELECT r.*, d.user_id
         FROM vehicle_change_requests r
         JOIN drivers d ON d.id = r.driver_id
         WHERE r.id = ? FOR UPDATE`,
        [id],
      );
      const change = rows[0];
      if (!change || change.status !== 'pending') {
        throw Object.assign(new Error('Заявка уже рассмотрена или не найдена'), { statusCode: 409 });
      }
      if (input.decision === 'approved') {
        const [plateRows] = await connection.query<(RowDataPacket & { id: string })[]>(
          `SELECT id FROM vehicles
           WHERE active = TRUE AND plate = ? AND driver_id <> ? LIMIT 1 FOR UPDATE`,
          [change.plate, change.driver_id],
        );
        if (plateRows[0]) {
          throw Object.assign(new Error('Этот госномер уже используется другим водителем'), {
            statusCode: 409,
            code: 'PLATE_ALREADY_EXISTS',
          });
        }
        await connection.execute(
          'UPDATE vehicles SET active = FALSE WHERE driver_id = ? AND active = TRUE',
          [change.driver_id],
        );
        await connection.execute(
          `INSERT INTO vehicles (id, driver_id, make, model, year, color, color_hex, plate, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [
            randomUUID(),
            change.driver_id,
            change.vehicle_make,
            change.vehicle_model,
            change.vehicle_year,
            change.vehicle_color,
            change.vehicle_color_hex,
            change.plate,
          ],
        );
        await connection.execute(
          'UPDATE drivers SET has_child_seat = ? WHERE id = ?',
          [change.has_child_seat, change.driver_id],
        );
      }
      await connection.execute(
        `UPDATE vehicle_change_requests
         SET status = ?, moderation_comment = ?, moderated_by = ?,
           moderated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [input.decision, input.comment ?? null, session.id, id],
      );
      return {
        userId: change.user_id,
        driverId: change.driver_id,
        before: change.status,
        after: input.decision,
      };
    });
    await audit(
      session.id,
      'vehicle_change.moderate',
      'vehicle_change_request',
      id,
      changed.before,
      changed.after,
      request.ip,
    );
    publish(`user:${changed.userId}`, 'vehicle-change:updated', { id, status: input.decision });
    const vehicleNotification = {
      title:
        input.decision === 'approved'
          ? 'Изменения автомобиля одобрены'
          : 'Заявка на автомобиль требует внимания',
      body:
        input.decision === 'approved'
          ? 'Новые данные автомобиля уже действуют'
          : input.comment || 'Откройте кабинет водителя, чтобы увидеть решение',
    };
    void notifyUsers([changed.userId], {
      ...vehicleNotification,
      data: { vehicleChangeRequestId: id },
    }).catch((error) => app.log.warn({ error }, 'push notification failed'));
    notifyMessengers(
      notifyUsersInMessengers([changed.userId], {
        icon: input.decision === 'approved' ? '✅' : '⚠️',
        title: vehicleNotification.title,
        body: vehicleNotification.body,
        details: [['Комментарий администратора', input.comment]],
        action: { label: 'Открыть профиль', url: appUrl('/driver/profile') },
      }),
      'vehicle-change.moderated',
    );
    return { data: { id, status: input.decision } };
  });

  app.get('/v1/admin/drivers', async (request) => {
    await auth(request, 'admin');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT d.id, d.status, d.rating, d.commission_bps AS commissionBps,
        d.has_child_seat AS hasChildSeat, u.name, u.phone,
        v.make, v.model, v.year, v.color, v.color_hex AS colorHex, v.plate,
        d.created_at AS createdAt,
        COALESCE(SUM(CASE WHEN o.status = 'completed' AND o.completed_at >= UTC_DATE()
          THEN o.price_minor ELSE 0 END), 0) AS grossTodayMinor,
        SUM(CASE WHEN o.status = 'completed' AND o.completed_at >= UTC_DATE()
          THEN 1 ELSE 0 END) AS ridesToday
       FROM drivers d JOIN users u ON u.id = d.user_id
       LEFT JOIN vehicles v ON v.driver_id = d.id AND v.active = TRUE
       LEFT JOIN orders o ON o.driver_id = d.id
       GROUP BY d.id, u.id, v.id
       ORDER BY d.created_at DESC`,
    );
    return { data: rows };
  });

  app.patch('/v1/admin/drivers/:id', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = request.params as { id: string };
    const input = parse(
      z.object({
        status: z.enum(['offline', 'online', 'suspended']).optional(),
        commissionBps: z.number().int().min(0).max(5000).nullable().optional(),
      }),
      request.body,
    );
    const before = await firstRow<RowDataPacket & { status: string; commission_bps: number | null }>(
      'SELECT status, commission_bps FROM drivers WHERE id = ?',
      [id],
    );
    if (!before) throw Object.assign(new Error('Водитель не найден'), { statusCode: 404 });
    await db.execute(
      `UPDATE drivers SET status = COALESCE(?, status),
       commission_bps = CASE WHEN ? THEN ? ELSE commission_bps END WHERE id = ?`,
      [
        input.status ?? null,
        Object.prototype.hasOwnProperty.call(input, 'commissionBps'),
        input.commissionBps ?? null,
        id,
      ],
    );
    if (input.status === 'online') {
      await openDriverShift(id);
    } else if (input.status === 'offline' || input.status === 'suspended') {
      await closeDriverShift(id);
    }
    await audit(session.id, 'driver.update', 'driver', id, before, input, request.ip);
    if (input.status !== undefined || Object.prototype.hasOwnProperty.call(input, 'commissionBps')) {
      notifyMessengers(
        notifyDriversInMessengers([id], {
          icon: input.status === 'suspended' ? '⛔' : 'ℹ️',
          title: input.status === 'suspended'
            ? 'Доступ водителя приостановлен'
            : 'Настройки водителя изменены',
          body: input.status === 'suspended'
            ? 'Администратор временно приостановил доступ к заказам.'
            : 'Администратор обновил настройки вашего профиля водителя.',
          details: [
            ['Статус', input.status
              ? { online: 'на линии', offline: 'не на линии', suspended: 'приостановлен' }[input.status]
              : null],
            ['Комиссия', Object.prototype.hasOwnProperty.call(input, 'commissionBps')
              ? input.commissionBps == null
                ? 'по тарифу сервиса'
                : `${input.commissionBps / 100}%`
              : null],
          ],
          action: { label: 'Открыть профиль', url: appUrl('/driver/profile') },
        }),
        'driver.admin-updated',
      );
    }
    return { data: { id, ...input } };
  });

  app.get('/v1/admin/tariffs', async (request) => {
    await auth(request, 'admin');
    return { data: await pricingRules() };
  });

  app.put('/v1/admin/tariffs', async (request) => {
    const session = await auth(request, 'admin');
    const input = parse(
      z.object({
        fare07To22Minor: z.number().int().min(0).max(1_000_000),
        fare22To02Minor: z.number().int().min(0).max(1_000_000),
        fare02To07Minor: z.number().int().min(0).max(1_000_000),
        childSurchargeMinor: z.number().int().min(0).max(1_000_000),
        waitingFreeMinutes: z.number().int().min(0).max(120),
        waitingPerMinuteMinor: z.number().int().min(0).max(100_000),
        serviceCommissionBps: z.number().int().min(0).max(5000),
      }),
      request.body,
    );
    const before = await pricingRules();
    await db.execute(
      `UPDATE tariff_settings SET fare_07_22_minor = ?,
       fare_22_02_minor = ?, fare_02_07_minor = ?,
       child_surcharge_minor = ?, waiting_free_minutes = ?,
       waiting_per_minute_minor = ?, service_commission_bps = ?,
       updated_by = ? WHERE id = 1`,
      [
        input.fare07To22Minor,
        input.fare22To02Minor,
        input.fare02To07Minor,
        input.childSurchargeMinor,
        input.waitingFreeMinutes,
        input.waitingPerMinuteMinor,
        input.serviceCommissionBps,
        session.id,
      ],
    );
    await audit(session.id, 'tariffs.update', 'tariff_settings', '1', before, input, request.ip);
    publish('admins', 'tariffs:updated', input);
    return { data: { currency: 'RUB', ...input } };
  });
}
