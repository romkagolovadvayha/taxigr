import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import {
  calculateCommissionMinor,
  calculateFareMinor,
  calculateMultiStopFareMinor,
  calculateWaitingChargeMinor,
  classifyMultiStopPricingScope,
  farePeriodAt,
  farePeriodLabel,
  isGrahovoAddress,
  type PricingRules,
  type PricingScope,
} from '../src/domain/pricing';
import {
  isDestinationAddressComplete,
  isPickupAddressComplete,
} from '../src/domain/address-precision';
import { buildDestinationHistory } from '../src/domain/address-history';
import { formatMultiStopRouteLabel } from '../src/domain/route-label';
import {
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
  liveLocationUpdateDelay,
} from '../src/domain/live-location';
import { canTransitionRide, driverRouteTarget } from '../src/domain/ride-state';
import { canSendRideChatMessage } from '../src/domain/ride-chat';
import {
  maximumAssignedDriverOrders,
  selectDriverOrderQueue,
} from '../src/domain/driver-order-queue';
import { searchPriceIncreaseSlotAt } from '../src/domain/search-price-increase';
import {
  canDriverReceivePriorityOrder,
  defaultDriverDispatchSettings,
  driverPriorityScopes,
  type DriverDispatchSettings,
  type DriverPriorityScope,
} from '../src/domain/driver-priority';
import {
  placeCategories,
  type RideChatParticipant,
  type RideChatRole,
  type RideChatViewerRole,
  type Address,
  type RideStatus,
  type TariffCode,
  type UserRole,
} from '../src/domain/models';
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
  answerMaxCallback,
  extractPhoneFromMaxVcf,
  getMaxDialogProfilePhotoUrl,
  requestMaxContact,
  sendMaxConfirmation,
  verifyMaxContact,
} from './max-bot';
import {
  createMessengerOrderActionHandler,
  type MessengerOrderActionRequest,
  type MessengerOrderActionResult,
} from './messenger-order-actions';
import {
  appUrl,
  closeUnassignedDriverOrderOffers,
  notifyDriversInMessengers,
  notifyUsersInMessengers,
} from './messenger-notifications';
import {
  destinationHistorySelect,
  limitOrderRatings,
  orderSelect,
  orderSummarySelect,
  presentDestinationHistoryOrder,
  presentOrder,
  presentOrderSummary,
  type DestinationHistoryRow,
  type OrderRatingViewer,
  type OrderRow,
  type OrderSummaryRow,
} from './presenters';
import { driverRideNotification, passengerRideNotification } from './ride-messenger';
import {
  decodeRideChatImage,
  MAX_RIDE_CHAT_IMAGE_BYTES,
  presentRideChatMessage,
  RIDE_CHAT_UPLOAD_BODY_MAX_BYTES,
  rideChatAvatarUrl,
  rideChatMessengerNotification,
  rideChatMessageSelect,
  rideChatPush,
  type RideChatMessageRow,
} from './ride-chat';
import { findPlace, listPlaces, placeToAddress, searchPlaces } from './places';
import {
  deviceFingerprint,
  hashesMatch,
  maskPhone,
  normalizeRussianPhone,
  phoneCodeHash,
} from './phone-verification';
import { isPlayReviewPhone, PLAY_REVIEW_CODE } from './play-review-auth';
import { notifyDrivers, notifyUsers } from './push';
import { driverOrderAvailablePush, passengerRidePush } from './ride-push';
import {
  findOrCreatePhoneUser,
  findUserWithRoles,
  linkMessengerIdentity,
} from './repositories';
import {
  getMultiStopPricedRouteMetrics,
  getMultiStopRouteMetrics,
  getRouteMetrics,
  haversineMeters,
} from './routing';
import {
  authenticate,
  randomToken,
  requireRole,
  sha256,
  signOrderQuote,
  signSession,
  verifyOrderQuote,
  type AuthUser,
} from './security';
import { sendPhoneVerificationCode, verifyPhoneVerificationCode } from './sms';
import {
  syncUserAvatarFromRemoteUrlIfEmpty,
  userHasNoAvatar,
} from './social-avatar';
import { getTelegramProfilePhotoUrl } from './telegram-bot';
import { processTelegramUpdate, telegramUpdateSchema } from './telegram-updates';
import {
  exchangeVkAuthorizationCode,
  vkAuthorizationUrl,
  vkCallbackHtml,
  vkCommunityMessageUrl,
} from './vk-auth';
import { answerVkMessageEvent, isVkMessagesAllowed, sendVkMessage } from './vk-bot';
import {
  verifyVkMiniAppLaunchParams,
  verifyVkMiniAppPhone,
} from './vk-mini-app-auth';
import { getVapidConfig } from './vapid';

type EventPublisher = (room: string, event: string, payload: unknown) => void;
type RealtimeControls = {
  disconnectUser: (userId: string) => void;
};

const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const passengerLocationSchema = pointSchema.extend({
  orderId: z.string().uuid(),
  accuracyMeters: z.number().min(0).max(10_000).optional(),
});
const addressSchema = z.object({
  id: z.string().max(80).default('address'),
  label: z.string().trim().min(2).max(255),
  details: z.string().trim().max(255).optional(),
  houseNumber: z.string().trim().min(1).max(24).optional(),
  placeId: z.string().uuid().optional(),
  kind: z.enum(['house', 'street', 'settlement', 'place']).optional(),
  coordinates: pointSchema,
});
const pickupAddressSchema = addressSchema.refine(isPickupAddressComplete, {
  message: 'Для места подачи укажите адрес с номером дома или выберите место из справочника',
  path: ['label'],
});
const destinationAddressSchema = addressSchema.refine(isDestinationAddressComplete, {
  message: 'Укажите адрес с номером дома, место из справочника или населённый пункт',
  path: ['label'],
});
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const openingIntervalSchema = z.object({
  opensAt: clockTimeSchema,
  closesAt: clockTimeSchema,
});
const weeklyScheduleSchema = z.object({
  mon: z.array(openingIntervalSchema).max(6),
  tue: z.array(openingIntervalSchema).max(6),
  wed: z.array(openingIntervalSchema).max(6),
  thu: z.array(openingIntervalSchema).max(6),
  fri: z.array(openingIntervalSchema).max(6),
  sat: z.array(openingIntervalSchema).max(6),
  sun: z.array(openingIntervalSchema).max(6),
});
const socialLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().url().max(1000),
});
const placeInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  category: z.enum(placeCategories),
  description: z.string().trim().max(4000).optional(),
  addressLabel: z.string().trim().min(3).max(255),
  houseNumber: z.string().trim().min(1).max(24).optional(),
  coordinates: pointSchema,
  phone: z.string().trim().max(64).optional(),
  website: z.string().url().max(1000).optional(),
  socialLinks: z.array(socialLinkSchema).max(20).default([]),
  photoUrls: z.array(z.string().url().max(2000)).max(20).default([]),
  schedule: weeklyScheduleSchema,
  active: z.boolean().default(true),
  sourceName: z.string().trim().max(120).optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceCheckedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
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
const quoteSchema = z.object({
  pickup: pickupAddressSchema,
  destination: destinationAddressSchema,
  destinations: z.array(destinationAddressSchema).min(1).max(5).optional(),
});
const createOrderSchema = quoteSchema.extend({
  tariff: tariffSchema,
  quoteToken: z.string().min(32).max(32_000),
  paymentMethod: z.enum(['cash', 'transfer']).default('cash'),
  comment: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(12).max(128),
  deviceId: z.string().min(16).max(128),
  legalAcceptance: initialLegalAcceptanceSchema.optional(),
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
const vkCallbackSchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(20).max(128),
  device_id: z.string().min(1).max(256),
});
const vkMiniAppAuthSchema = z.object({
  launchParams: z.string().min(1).max(8_192),
  phoneNumber: z.string().trim().min(10).max(32).optional(),
  phoneSign: z.string().min(16).max(256).optional(),
  phoneVerified: z.literal(true).optional(),
  messagesPermissionGranted: z.boolean(),
  installationId: z.string().trim().min(16).max(128),
  profile: z.object({
    id: z.number().int().positive(),
    firstName: z.string().trim().max(80).nullable().optional(),
    lastName: z.string().trim().max(80).nullable().optional(),
    avatarUrl: z.string().url().max(2_000).nullable().optional(),
  }),
}).superRefine((input, context) => {
  const phoneFields = [input.phoneNumber, input.phoneSign, input.phoneVerified];
  if (
    phoneFields.some((value) => value !== undefined)
    && phoneFields.some((value) => value === undefined)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Данные номера VK переданы не полностью',
    });
  }
});
const vkMiniAppSessionSchema = z.object({
  launchParams: z.string().min(1).max(8_192),
});
const vkCallbackUpdateSchema = z.object({
  type: z.string(),
  group_id: z.union([z.string(), z.number()]),
  secret: z.string().optional(),
  object: z.object({
    message: z.object({
      from_id: z.union([z.string(), z.number()]),
      peer_id: z.union([z.string(), z.number()]),
      text: z.string().optional(),
    }).passthrough().optional(),
    user_id: z.union([z.string(), z.number()]).optional(),
    peer_id: z.union([z.string(), z.number()]).optional(),
    conversation_message_id: z.union([z.string(), z.number()]).optional(),
    event_id: z.string().optional(),
    payload: z.unknown().optional(),
  }).passthrough().optional(),
}).passthrough();
const maxUpdateSchema = z.object({
  update_type: z.string(),
  chat_id: z.union([z.string(), z.number()]).optional(),
  payload: z.string().nullable().optional(),
  user: z.object({
    user_id: z.union([z.string(), z.number()]),
    name: z.string().trim().max(160).nullish(),
    username: z.string().trim().max(64).nullish(),
    avatar_url: z.string().url().max(2_000).nullish(),
    full_avatar_url: z.string().url().max(2_000).nullish(),
  }).passthrough().optional(),
  callback: z.object({
    callback_id: z.string().min(1),
    payload: z.string().optional(),
    user: z.object({
      user_id: z.union([z.string(), z.number()]),
    }).passthrough(),
  }).passthrough().optional(),
  message: z.object({
    sender: z.object({ user_id: z.union([z.string(), z.number()]) }).passthrough().optional(),
    body: z.object({
      mid: z.string().optional(),
      attachments: z.array(z.unknown()).optional(),
    }).passthrough().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();
const clientErrorSchema = z.object({
  source: z.enum([
    'react-error-boundary',
    'global-error',
    'unhandled-rejection',
    'resource-error',
    'push-registration',
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
const notificationChannelProviderSchema = z.enum(['vk', 'max', 'telegram']);
const notificationChannelSchema = z.object({
  provider: notificationChannelProviderSchema,
  enabled: z.boolean(),
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
const rideChatMessageSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().max(1_000).default(''),
  attachment: z.object({
    type: z.literal('image'),
    base64: z.string().min(16).max(Math.ceil(MAX_RIDE_CHAT_IMAGE_BYTES / 3) * 4 + 64),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    width: z.number().int().min(1).max(20_000).optional(),
    height: z.number().int().min(1).max(20_000).optional(),
    fileName: z.string().trim().min(1).max(160).optional(),
  }).optional(),
}).refine((input) => input.body.length > 0 || input.attachment, {
  message: 'Добавьте текст или фотографию',
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
  const block = await firstRow<
    RowDataPacket & { blocked_at: Date | string | null; block_reason: string | null }
  >('SELECT blocked_at, block_reason FROM users WHERE id = ? LIMIT 1', [user.id]);
  if (block?.blocked_at) {
    throw Object.assign(new Error('Ваша учётная запись заблокирована'), {
      statusCode: 403,
      code: 'USER_BLOCKED',
      details: {
        blockedAt: new Date(block.blocked_at).toISOString(),
        reason: block.block_reason ?? 'Причина не указана',
      },
    });
  }
  if (role) requireRole(user, role);
  return user;
}

type PricingRow = RowDataPacket & {
  grahovo_fare_07_22_minor: number;
  grahovo_fare_22_02_minor: number;
  grahovo_fare_02_07_minor: number;
  district_per_kilometer_07_22_minor: number;
  district_per_kilometer_22_02_minor: number;
  district_per_kilometer_02_07_minor: number;
  intercity_per_kilometer_minor: number;
  child_surcharge_minor: number;
  additional_stop_grahovo_surcharge_bps: number;
  waiting_free_minutes: number;
  waiting_per_minute_minor: number;
  search_price_increase_interval_minutes: number;
  search_price_increase_step_minor: number;
  service_commission_bps: number;
  passenger_cancellation_limit: number;
  passenger_cancellation_window_hours: number;
  passenger_cancellation_block_hours: number;
};

async function pricingRules(connection?: PoolConnection): Promise<PricingRules> {
  const executor = connection ?? db;
  const [rows] = await executor.query<PricingRow[]>('SELECT * FROM tariff_settings WHERE id = 1');
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Тарифы временно недоступны'), { statusCode: 503, code: 'NO_TARIFFS' });
  return {
    currency: 'RUB',
    grahovoFare07To22Minor: row.grahovo_fare_07_22_minor,
    grahovoFare22To02Minor: row.grahovo_fare_22_02_minor,
    grahovoFare02To07Minor: row.grahovo_fare_02_07_minor,
    districtPerKilometer07To22Minor: row.district_per_kilometer_07_22_minor,
    districtPerKilometer22To02Minor: row.district_per_kilometer_22_02_minor,
    districtPerKilometer02To07Minor: row.district_per_kilometer_02_07_minor,
    intercityPerKilometerMinor: row.intercity_per_kilometer_minor,
    childSurchargeMinor: row.child_surcharge_minor,
    additionalStopGrahovoSurchargeBps: row.additional_stop_grahovo_surcharge_bps,
    waitingFreeMinutes: row.waiting_free_minutes,
    waitingPerMinuteMinor: row.waiting_per_minute_minor,
    searchPriceIncreaseIntervalMinutes: row.search_price_increase_interval_minutes,
    searchPriceIncreaseStepMinor: row.search_price_increase_step_minor,
    serviceCommissionBps: row.service_commission_bps,
    passengerCancellationLimit: row.passenger_cancellation_limit,
    passengerCancellationWindowHours: row.passenger_cancellation_window_hours,
    passengerCancellationBlockHours: row.passenger_cancellation_block_hours,
  };
}

function quoteTariffs(
  pricingDistanceMeters: number,
  rules: PricingRules,
  scope: PricingScope,
  includesDriverApproach: boolean,
  pricedAt = new Date(),
  etaMinutes: Record<TariffCode, number> = { economy: 10, child: 15 },
  priceOverrides?: Record<TariffCode, number>,
  destinationCount = 1,
) {
  const periodDescription = farePeriodLabel[farePeriodAt(pricedAt)];
  const approachDescription = includesDriverApproach ? ' · подача из Грахово включена' : '';
  return (['economy', 'child'] as const).map((code) => ({
    code,
    title: code === 'child' ? 'Детский' : 'Эконом',
    description:
      code === 'child'
        ? `Подходящее детское кресло без выбора типа${approachDescription}`
        : scope === 'grahovo'
          ? `Фиксированная цена по Грахово · ${periodDescription}`
          : scope === 'district'
            ? `По Граховскому району · ${periodDescription}${approachDescription}`
            : `Междугородняя поездка${approachDescription}`,
    childSeatIncluded: code === 'child',
    etaMinutes: etaMinutes[code],
    priceMinor:
      priceOverrides?.[code] ??
      calculateFareMinor(pricingDistanceMeters, code, scope, rules, pricedAt),
    ...(destinationCount > 1 ? { stopCount: destinationCount } : {}),
  }));
}

function multiStopPrices(
  pickup: Address,
  destinations: readonly Address[],
  segmentDistances: readonly number[],
  segmentScopes: readonly PricingScope[],
  driverApproachDistanceMeters: number,
  rules: PricingRules,
  pricedAt: Date,
): Record<TariffCode, number> {
  const allPointsInGrahovo = [pickup, ...destinations].every(isGrahovoAddress);
  const segments = segmentDistances.map((distanceMeters, index) => ({
    distanceMeters,
    scope: segmentScopes[index]!,
  }));
  return {
    economy: calculateMultiStopFareMinor(
      segments,
      'economy',
      allPointsInGrahovo,
      rules,
      pricedAt,
      driverApproachDistanceMeters,
    ),
    child: calculateMultiStopFareMinor(
      segments,
      'child',
      allPointsInGrahovo,
      rules,
      pricedAt,
      driverApproachDistanceMeters,
    ),
  };
}

async function estimateTariffEtaMinutes(pickup: Address): Promise<Record<TariffCode, number>> {
  const [rows] = await db.query<
    (RowDataPacket & {
      has_child_seat: number;
      latitude: number;
      longitude: number;
    })[]
  >(
    `SELECT d.has_child_seat, l.latitude, l.longitude
     FROM drivers d
     JOIN driver_locations l ON l.driver_id = d.id
     WHERE d.status = 'online'
       AND NOT EXISTS (
         SELECT 1 FROM orders active_order
         WHERE active_order.driver_id = d.id
           AND active_order.status IN ('accepted','driver_arriving','driver_waiting','in_progress')
       )
       AND l.recorded_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE)`,
  );
  const etaFor = (childSeatRequired: boolean, fallback: number) => {
    const distances = rows
      .filter((row) => !childSeatRequired || Boolean(row.has_child_seat))
      .map((row) => haversineMeters(
        { latitude: Number(row.latitude), longitude: Number(row.longitude) },
        pickup.coordinates,
      ));
    if (!distances.length) return fallback;
    const nearestDistance = Math.min(...distances);
    return Math.min(60, Math.max(3, Math.ceil((nearestDistance * 1.28) / 600) + 2));
  };
  return {
    economy: etaFor(false, 15),
    child: etaFor(true, 20),
  };
}

async function resolveTrustedAddress(address: Address): Promise<Address> {
  if (!address.placeId) return address;
  const place = await findPlace(address.placeId);
  if (!place?.active) {
    throw Object.assign(new Error('Выбранное место больше недоступно'), {
      statusCode: 422,
      code: 'PLACE_NOT_AVAILABLE',
    });
  }
  const canonical = placeToAddress(place);
  return {
    id: canonical.id,
    label: canonical.label,
    details: canonical.details,
    houseNumber: canonical.houseNumber,
    placeId: canonical.placeId,
    kind: canonical.kind,
    coordinates: canonical.coordinates,
  };
}

function submittedDestinations(input: { destination: Address; destinations?: Address[] }): Address[] {
  const destinations = input.destinations ?? [input.destination];
  const finalDestination = destinations.at(-1);
  if (!finalDestination || !addressesMatch(finalDestination, input.destination)) {
    throw Object.assign(new Error('Последняя точка маршрута не совпадает с адресом назначения'), {
      statusCode: 422,
      code: 'DESTINATION_ORDER_MISMATCH',
    });
  }
  return destinations;
}

async function resolveTrustedAddresses(input: {
  pickup: Address;
  destination: Address;
  destinations?: Address[];
}) {
  const requestedDestinations = submittedDestinations(input);
  const [pickup, ...destinations] = await Promise.all([
    resolveTrustedAddress(input.pickup),
    ...requestedDestinations.map(resolveTrustedAddress),
  ]);
  return { pickup, destinations, destination: destinations.at(-1)! };
}

function addressesMatch(left: Address, right: Address): boolean {
  return left.label === right.label &&
    (left.details ?? '') === (right.details ?? '') &&
    (left.houseNumber ?? '') === (right.houseNumber ?? '') &&
    (left.placeId ?? '') === (right.placeId ?? '') &&
    (left.kind ?? '') === (right.kind ?? '') &&
    Math.abs(left.coordinates.latitude - right.coordinates.latitude) < 0.000_001 &&
    Math.abs(left.coordinates.longitude - right.coordinates.longitude) < 0.000_001;
}

async function getOrder(id: string): Promise<OrderRow | null> {
  return firstRow<OrderRow>(`${orderSelect} WHERE o.id = ?`, [id]);
}

type RideChatAccessRow = RowDataPacket & {
  order_id: string;
  order_status: RideStatus;
  passenger_id: string;
  passenger_name: string;
  passenger_avatar_url: string | null;
  passenger_avatar_mime: string | null;
  passenger_updated_at: Date | string;
  driver_id: string | null;
  driver_user_id: string | null;
  driver_name: string | null;
  driver_avatar_url: string | null;
  driver_avatar_mime: string | null;
  driver_updated_at: Date | string | null;
};

type RideChatAccess = {
  row: RideChatAccessRow;
  viewerRole: RideChatViewerRole;
  counterpart?: RideChatParticipant;
  participants?: RideChatParticipant[];
};

async function getRideChatAccess(
  orderId: string,
  session: AuthUser,
  connection?: PoolConnection,
  lock = false,
): Promise<RideChatAccess> {
  const executor = connection ?? db;
  const [rows] = await executor.query<RideChatAccessRow[]>(
    `SELECT orders.id AS order_id, orders.status AS order_status,
       orders.passenger_id, passenger.name AS passenger_name,
       passenger.avatar_url AS passenger_avatar_url,
       passenger.avatar_mime AS passenger_avatar_mime,
       passenger.updated_at AS passenger_updated_at,
       orders.driver_id, driver.user_id AS driver_user_id,
       driver_user.name AS driver_name,
       driver_user.avatar_url AS driver_avatar_url,
       driver_user.avatar_mime AS driver_avatar_mime,
       driver_user.updated_at AS driver_updated_at
     FROM orders
     JOIN users passenger ON passenger.id = orders.passenger_id
     LEFT JOIN drivers driver ON driver.id = orders.driver_id
     LEFT JOIN users driver_user ON driver_user.id = driver.user_id
     WHERE orders.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [orderId],
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error('Заказ не найден'), {
      statusCode: 404,
      code: 'ORDER_NOT_FOUND',
    });
  }
  if (!row.driver_id || !row.driver_user_id || !row.driver_name || !row.driver_updated_at) {
    throw Object.assign(new Error('Чат станет доступен после назначения водителя'), {
      statusCode: 409,
      code: 'RIDE_CHAT_UNAVAILABLE',
    });
  }

  if (row.passenger_id === session.id) {
    return {
      row,
      viewerRole: 'passenger',
      counterpart: {
        id: row.driver_user_id,
        name: row.driver_name,
        role: 'driver',
        avatarUrl: rideChatAvatarUrl(
          row.driver_user_id,
          row.driver_avatar_url,
          row.driver_avatar_mime,
          row.driver_updated_at,
        ),
      },
    };
  }
  if (row.driver_user_id === session.id) {
    return {
      row,
      viewerRole: 'driver',
      counterpart: {
        id: row.passenger_id,
        name: row.passenger_name,
        role: 'passenger',
        avatarUrl: rideChatAvatarUrl(
          row.passenger_id,
          row.passenger_avatar_url,
          row.passenger_avatar_mime,
          row.passenger_updated_at,
        ),
      },
    };
  }

  if (session.roles.includes('admin')) {
    return {
      row,
      viewerRole: 'admin',
      participants: [
        {
          id: row.passenger_id,
          name: row.passenger_name,
          role: 'passenger',
          avatarUrl: rideChatAvatarUrl(
            row.passenger_id,
            row.passenger_avatar_url,
            row.passenger_avatar_mime,
            row.passenger_updated_at,
          ),
        },
        {
          id: row.driver_user_id,
          name: row.driver_name,
          role: 'driver',
          avatarUrl: rideChatAvatarUrl(
            row.driver_user_id,
            row.driver_avatar_url,
            row.driver_avatar_mime,
            row.driver_updated_at,
          ),
        },
      ],
    };
  }

  throw Object.assign(new Error('Нет доступа к чату этой поездки'), {
    statusCode: 403,
    code: 'RIDE_CHAT_FORBIDDEN',
  });
}

type RideChatUnreadCountRow = RowDataPacket & {
  order_id: string;
  unread_count: number | string;
};

async function getRideChatUnreadCounts(userId: string): Promise<Record<string, number>> {
  const [rows] = await db.query<RideChatUnreadCountRow[]>(
    `SELECT message.order_id, COUNT(*) AS unread_count
     FROM ride_chat_messages message
     JOIN orders ON orders.id = message.order_id
     LEFT JOIN drivers driver ON driver.id = orders.driver_id
     LEFT JOIN ride_chat_reads read_state
       ON read_state.order_id = message.order_id AND read_state.user_id = ?
     WHERE (orders.passenger_id = ? OR driver.user_id = ?)
       AND message.sender_user_id <> ?
       AND (
         read_state.user_id IS NULL
         OR message.created_at > read_state.last_read_created_at
         OR (
           message.created_at = read_state.last_read_created_at
           AND message.id > read_state.last_read_message_id
         )
       )
     GROUP BY message.order_id`,
    [userId, userId, userId, userId],
  );
  return Object.fromEntries(
    rows.map((row) => [row.order_id, Number(row.unread_count)]),
  );
}

function ratingViewerForOrder(
  row: OrderRow,
  session: AuthUser,
  driverId?: string,
): OrderRatingViewer {
  if (session.roles.includes('admin')) return 'admin';
  return row.passenger_id === session.id
    ? 'passenger'
    : driverId === row.driver_id
      ? 'driver'
      : 'passenger';
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
  const priceMinor =
    Number(row.base_price_minor) +
    Number(row.search_price_increase_minor) +
    waitingPriceMinor;
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

async function getDriver(userId: string, connection?: PoolConnection, lock = false) {
  const executor = connection ?? db;
  const [rows] = await executor.query<
    (RowDataPacket & { id: string; status: string; commission_bps: number | null; vehicle_id: string | null })[]
  >(
    `SELECT d.id, d.status, d.commission_bps,
       (SELECT v.id FROM vehicles v WHERE v.driver_id = d.id AND v.active = TRUE LIMIT 1) AS vehicle_id
     FROM drivers d
     WHERE d.user_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  return rows[0] ?? null;
}

async function loadDriverOfferRows(
  driver: { id: string; status: string },
  limit = 20,
): Promise<OrderRow[]> {
  if (!['online', 'busy'].includes(driver.status)) return [];
  const [rows] = await db.query<OrderRow[]>(
    `${orderSelect}
     WHERE o.status = 'searching' AND o.driver_id IS NULL
        AND o.created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
        AND (
          o.priority_release_at IS NULL
          OR o.priority_release_at <= UTC_TIMESTAMP(3)
          OR EXISTS (
            SELECT 1 FROM driver_priority_assignments priority
            WHERE priority.driver_id = ? AND priority.scope = o.pricing_scope
          )
        )
        AND (
          SELECT COUNT(*) FROM orders active_order
          WHERE active_order.driver_id = ?
            AND active_order.status IN ('accepted','driver_arriving','driver_waiting','in_progress')
        ) < ?
        AND NOT EXISTS (
          SELECT 1 FROM driver_order_rejections rejected
          WHERE rejected.order_id = o.id AND rejected.driver_id = ?
        )
        AND (o.tariff <> 'child' OR EXISTS (
          SELECT 1 FROM drivers eligible WHERE eligible.id = ? AND eligible.has_child_seat = TRUE
        ))
     ORDER BY o.created_at ASC LIMIT ?`,
    [
      config.ORDER_SEARCH_TTL_MINUTES,
      driver.id,
      driver.id,
      maximumAssignedDriverOrders,
      driver.id,
      driver.id,
      Math.min(20, Math.max(1, limit)),
    ],
  );
  return rows;
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

async function recalculateRating(
  connection: PoolConnection,
  rateeUserId: string,
  rateeKind: 'passenger' | 'driver',
): Promise<void> {
  if (rateeKind === 'driver') {
    await connection.execute(
      `UPDATE drivers d
       SET d.rating = COALESCE((
         SELECT AVG(rr.score) FROM ride_ratings rr WHERE rr.ratee_user_id = d.user_id
       ), 5.00),
       d.rating_count = (
         SELECT COUNT(*) FROM ride_ratings rr WHERE rr.ratee_user_id = d.user_id
       )
       WHERE d.user_id = ?`,
      [rateeUserId],
    );
    return;
  }
  await connection.execute(
    `UPDATE users u
     SET u.rating = COALESCE((
       SELECT AVG(rr.score) FROM ride_ratings rr WHERE rr.ratee_user_id = u.id
     ), 5.00),
     u.rating_count = (
       SELECT COUNT(*) FROM ride_ratings rr WHERE rr.ratee_user_id = u.id
     )
     WHERE u.id = ?`,
    [rateeUserId],
  );
}

async function loadAdminAccountProfile(userId: string) {
  const user = await firstRow<
    RowDataPacket & {
      id: string;
      name: string;
      gender: 'male' | 'female' | null;
      phone: string | null;
      avatar_url: string | null;
      avatar_mime: string | null;
      profile_completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
      blocked_at: Date | string | null;
      block_reason: string | null;
      blocked_by_name: string | null;
      order_blocked_until: Date | string | null;
      order_block_reason: string | null;
    }
  >(
    `SELECT u.id, u.name, u.gender, u.phone, u.avatar_url, u.avatar_mime,
      u.profile_completed_at, u.created_at, u.updated_at, u.blocked_at, u.block_reason,
      blocker.name AS blocked_by_name, u.order_blocked_until, u.order_block_reason
     FROM users u
     LEFT JOIN users blocker ON blocker.id = u.blocked_by
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    [userId],
  );
  if (!user) return null;
  const [roles] = await db.query<(RowDataPacket & { role: UserRole })[]>(
    'SELECT role FROM user_roles WHERE user_id = ? ORDER BY role',
    [userId],
  );
  const avatarUrl = user.avatar_mime
    ? `/v1/users/${user.id}/avatar?v=${new Date(user.updated_at).getTime()}`
    : user.avatar_url ?? undefined;
  return {
    id: user.id,
    name: user.name,
    gender: user.gender ?? undefined,
    phone: user.phone ?? undefined,
    avatarUrl,
    profileComplete: Boolean(user.profile_completed_at),
    roles: roles.map((row) => row.role),
    createdAt: new Date(user.created_at).toISOString(),
    updatedAt: new Date(user.updated_at).toISOString(),
    blockedAt: user.blocked_at ? new Date(user.blocked_at).toISOString() : undefined,
    blockReason: user.block_reason ?? undefined,
    blockedByName: user.blocked_by_name ?? undefined,
    orderBlockedUntil:
      user.order_blocked_until && new Date(user.order_blocked_until).getTime() > Date.now()
        ? new Date(user.order_blocked_until).toISOString()
        : undefined,
    orderBlockReason:
      user.order_blocked_until && new Date(user.order_blocked_until).getTime() > Date.now()
        ? user.order_block_reason ?? undefined
        : undefined,
  };
}

async function loadAdminAccountData(
  userId: string,
  driverId?: string,
): Promise<{
  stats: Record<string, unknown>;
  activity: Record<string, unknown>[];
  orders: ReturnType<typeof presentOrder>[];
  ratings: Record<string, unknown>[];
  consents: Record<string, unknown>[];
}> {
  const orderFilter = driverId ? 'o.driver_id = ?' : 'o.passenger_id = ?';
  const orderIdentity = driverId ?? userId;
  const [statRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS totalOrders,
      SUM(o.status = 'completed') AS completedOrders,
      SUM(o.status = 'cancelled') AS cancelledOrders,
      SUM(o.status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress')) AS activeOrders,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.price_minor ELSE 0 END), 0) AS grossMinor,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.commission_minor ELSE 0 END), 0) AS commissionMinor,
      COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.price_minor END), 0) AS averageOrderMinor,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.distance_meters ELSE 0 END), 0) AS distanceMeters,
      MIN(o.created_at) AS firstOrderAt, MAX(o.created_at) AS lastOrderAt
     FROM orders o WHERE ${orderFilter}`,
    [orderIdentity],
  );
  const [activityRows] = await db.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS date,
      SUM(o.status = 'completed') AS completedOrders,
      SUM(o.status = 'cancelled') AS cancelledOrders,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.price_minor ELSE 0 END), 0) AS grossMinor
     FROM orders o
     WHERE ${orderFilter} AND o.created_at >= DATE_SUB(UTC_DATE(), INTERVAL 29 DAY)
     GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')
     ORDER BY DATE_FORMAT(o.created_at, '%Y-%m-%d')`,
    [orderIdentity],
  );
  const [orderRows] = await db.query<OrderRow[]>(
    `${orderSelect} WHERE ${orderFilter} ORDER BY o.created_at DESC LIMIT 100`,
    [orderIdentity],
  );
  const [ratingRows] = await db.query<RowDataPacket[]>(
    `SELECT rr.id, rr.order_id AS orderId, rr.score, rr.rater_role AS raterRole,
      rr.rater_user_id AS raterId, rater.name AS raterName,
      rr.ratee_user_id AS rateeId, ratee.name AS rateeName, rr.created_at AS createdAt
     FROM ride_ratings rr
     JOIN users rater ON rater.id = rr.rater_user_id
     JOIN users ratee ON ratee.id = rr.ratee_user_id
     WHERE rr.rater_user_id = ? OR rr.ratee_user_id = ?
     ORDER BY rr.created_at DESC LIMIT 100`,
    [userId, userId],
  );
  const [consentRows] = await db.query<RowDataPacket[]>(
    `SELECT document_type AS documentType, document_version AS documentVersion,
      source, accepted_at AS acceptedAt, revoked_at AS revokedAt
     FROM user_consents WHERE user_id = ? ORDER BY accepted_at DESC`,
    [userId],
  );
  const rating = driverId
    ? await firstRow<RowDataPacket & { rating: number; rating_count: number }>(
        'SELECT rating, rating_count FROM drivers WHERE id = ?',
        [driverId],
      )
    : await firstRow<RowDataPacket & { rating: number; rating_count: number }>(
        'SELECT rating, rating_count FROM users WHERE id = ?',
        [userId],
      );
  const fiveStars = await firstRow<RowDataPacket & { value: number }>(
    'SELECT COUNT(*) AS value FROM ride_ratings WHERE ratee_user_id = ? AND score = 5',
    [userId],
  );
  const rawStats = statRows[0];
  const stats: Record<string, unknown> = {
    totalOrders: Number(rawStats?.totalOrders ?? 0),
    completedOrders: Number(rawStats?.completedOrders ?? 0),
    cancelledOrders: Number(rawStats?.cancelledOrders ?? 0),
    activeOrders: Number(rawStats?.activeOrders ?? 0),
    grossMinor: Number(rawStats?.grossMinor ?? 0),
    commissionMinor: Number(rawStats?.commissionMinor ?? 0),
    averageOrderMinor: Number(rawStats?.averageOrderMinor ?? 0),
    distanceMeters: Number(rawStats?.distanceMeters ?? 0),
    rating: Number(rating?.rating ?? 5),
    ratingCount: Number(rating?.rating_count ?? 0),
    fiveStarRatings: Number(fiveStars?.value ?? 0),
    firstOrderAt: rawStats?.firstOrderAt
      ? new Date(rawStats.firstOrderAt as Date | string).toISOString()
      : undefined,
    lastOrderAt: rawStats?.lastOrderAt
      ? new Date(rawStats.lastOrderAt as Date | string).toISOString()
      : undefined,
  };
  return {
    stats,
    activity: activityRows.map((row) => ({
      date: String(row.date),
      completedOrders: Number(row.completedOrders ?? 0),
      cancelledOrders: Number(row.cancelledOrders ?? 0),
      grossMinor: Number(row.grossMinor ?? 0),
    })),
    orders: orderRows.map(presentOrder),
    ratings: ratingRows.map((row) => ({
      id: String(row.id),
      orderId: String(row.orderId),
      score: Number(row.score),
      raterRole: row.raterRole,
      rater: { id: String(row.raterId), name: String(row.raterName) },
      ratee: { id: String(row.rateeId), name: String(row.rateeName) },
      createdAt: new Date(row.createdAt as Date | string).toISOString(),
    })),
    consents: consentRows.map((row) => ({
      documentType: String(row.documentType),
      documentVersion: String(row.documentVersion),
      source: String(row.source),
      acceptedAt: new Date(row.acceptedAt as Date | string).toISOString(),
      revokedAt: row.revokedAt
        ? new Date(row.revokedAt as Date | string).toISOString()
        : undefined,
    })),
  };
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

function requireVkConfiguration(): void {
  if (
    !config.VK_APP_ID ||
    !config.VK_REDIRECT_URI ||
    !config.VK_COMMUNITY_ID ||
    !config.VK_BOT_TOKEN ||
    !config.VK_CALLBACK_SECRET ||
    !config.VK_CALLBACK_CONFIRMATION
  ) {
    throw Object.assign(new Error('Вход через VK пока не настроен'), {
      statusCode: 503,
      code: 'VK_NOT_CONFIGURED',
    });
  }
}

function requireVkMiniAppConfiguration(): void {
  if (
    !config.VK_MINI_APP_ID ||
    !config.VK_MINI_APP_SECRET ||
    !config.VK_COMMUNITY_ID ||
    !config.VK_BOT_TOKEN
  ) {
    throw Object.assign(new Error('VK Mini App пока не настроено'), {
      statusCode: 503,
      code: 'VK_MINI_APP_NOT_CONFIGURED',
    });
  }
}

async function checkVkMiniAppMessagesPermission(
  vkUserId: string,
  retryAfterGrant: boolean,
): Promise<boolean> {
  const delays = retryAfterGrant ? [0, 250, 750] : [0];
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (await isVkMessagesAllowed(vkUserId)) return true;
  }
  return false;
}

type DriverAudience = 'all' | 'priority' | 'nonpriority' | 'available';

type DriverQueuePromotion = {
  id: string;
  passengerId: string;
} | null;

async function rebalanceDriverOrderQueue(
  connection: PoolConnection,
  driverId: string,
): Promise<DriverQueuePromotion> {
  const [currentRows] = await connection.query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM orders
     WHERE driver_id = ? AND active_driver_id = ?
       AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')
     LIMIT 1 FOR UPDATE`,
    [driverId, driverId],
  );
  if (currentRows[0]) {
    await connection.execute(
      "UPDATE drivers SET status = 'busy' WHERE id = ? AND status <> 'suspended'",
      [driverId],
    );
    return null;
  }

  const [queuedRows] = await connection.query<
    (RowDataPacket & { id: string; passenger_id: string })[]
  >(
    `SELECT id, passenger_id FROM orders
     WHERE driver_id = ? AND active_driver_id IS NULL AND status = 'accepted'
     ORDER BY created_at ASC, id ASC
     LIMIT 1 FOR UPDATE`,
    [driverId],
  );
  const queued = queuedRows[0];
  if (!queued) {
    await connection.execute(
      "UPDATE drivers SET status = 'online' WHERE id = ? AND status = 'busy'",
      [driverId],
    );
    return null;
  }

  await connection.execute(
    'UPDATE orders SET active_driver_id = ? WHERE id = ? AND active_driver_id IS NULL',
    [driverId, queued.id],
  );
  await connection.execute(
    `INSERT INTO order_events
      (order_id, event_type, from_status, to_status, payload)
     VALUES (?, 'driver.queue.promoted', 'accepted', 'accepted', ?)`,
    [queued.id, JSON.stringify({ driverId })],
  );
  await connection.execute(
    "UPDATE drivers SET status = 'busy' WHERE id = ? AND status <> 'suspended'",
    [driverId],
  );
  return { id: queued.id, passengerId: queued.passenger_id };
}

async function driverDispatchSettings(
  connection?: PoolConnection,
): Promise<DriverDispatchSettings> {
  const executor = connection ?? db;
  const [rows] = await executor.query<
    (RowDataPacket & { scope: DriverPriorityScope; delay_minutes: number })[]
  >('SELECT scope, delay_minutes FROM driver_dispatch_settings');
  const settings = { ...defaultDriverDispatchSettings };
  for (const row of rows) settings[row.scope] = Number(row.delay_minutes);
  return settings;
}

async function eligibleDriverIdsForOrder(
  orderId: string,
  audience: DriverAudience,
  connection?: PoolConnection,
): Promise<string[]> {
  const executor = connection ?? db;
  const priorityClause =
    audience === 'priority'
      ? `AND EXISTS (
           SELECT 1 FROM driver_priority_assignments priority
           WHERE priority.driver_id = d.id AND priority.scope = o.pricing_scope
         )`
      : audience === 'nonpriority'
        ? `AND NOT EXISTS (
             SELECT 1 FROM driver_priority_assignments priority
             WHERE priority.driver_id = d.id AND priority.scope = o.pricing_scope
           )`
        : audience === 'available'
          ? `AND (
               o.priority_release_at IS NULL
               OR o.priority_release_at <= UTC_TIMESTAMP(3)
               OR EXISTS (
                 SELECT 1 FROM driver_priority_assignments priority
                 WHERE priority.driver_id = d.id AND priority.scope = o.pricing_scope
               )
             )`
          : '';
  const [rows] = await executor.query<(RowDataPacket & { id: string })[]>(
    `SELECT d.id
     FROM orders o
     JOIN drivers d ON d.status IN ('online', 'busy')
     WHERE o.id = ?
       AND (o.tariff <> 'child' OR d.has_child_seat = TRUE)
       AND (
         SELECT COUNT(*) FROM orders active_order
         WHERE active_order.driver_id = d.id
           AND active_order.status IN ('accepted','driver_arriving','driver_waiting','in_progress')
       ) < ?
       AND NOT EXISTS (
         SELECT 1 FROM driver_order_rejections rejected
         WHERE rejected.order_id = o.id AND rejected.driver_id = d.id
       )
       ${priorityClause}`,
    [orderId, maximumAssignedDriverOrders],
  );
  return rows.map((row) => String(row.id));
}

async function preparePriorityDispatch(
  orderId: string,
  connection: PoolConnection,
): Promise<string[]> {
  const [orders] = await connection.query<
    (RowDataPacket & { pricing_scope: DriverPriorityScope })[]
  >('SELECT pricing_scope FROM orders WHERE id = ? LIMIT 1 FOR UPDATE', [orderId]);
  const order = orders[0];
  if (!order) throw new Error('Order dispatch setup failed');
  const priorityDriverIds = await eligibleDriverIdsForOrder(orderId, 'priority', connection);
  const settings = await driverDispatchSettings(connection);
  const delayMinutes = settings[order.pricing_scope];
  if (priorityDriverIds.length > 0 && delayMinutes > 0) {
    await connection.execute(
      `UPDATE orders
       SET priority_release_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE),
           priority_released_at = NULL
       WHERE id = ?`,
      [delayMinutes, orderId],
    );
    return priorityDriverIds;
  }
  await connection.execute(
    `UPDATE orders
     SET priority_release_at = UTC_TIMESTAMP(3), priority_released_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [orderId],
  );
  return eligibleDriverIdsForOrder(orderId, 'all', connection);
}

export type RegisteredRouteHandlers = {
  handleMessengerOrderAction: (
    request: MessengerOrderActionRequest,
  ) => Promise<MessengerOrderActionResult>;
  expireStaleSearchingOrders: () => Promise<number>;
  releaseDuePriorityOrders: () => Promise<number>;
};

export async function registerRoutes(
  app: FastifyInstance,
  publish: EventPublisher,
  realtime: RealtimeControls,
): Promise<RegisteredRouteHandlers> {
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
  const sendOrderToDrivers = (
    order: ReturnType<typeof presentOrder>,
    driverIds: string[],
    options: { priceIncreased?: boolean; delayed?: boolean } = {},
  ): void => {
    for (const driverId of driverIds) {
      publish(`driver:${driverId}`, 'order:available', order);
    }
    void notifyDrivers(
      driverIds,
      driverOrderAvailablePush(order.id, options.priceIncreased),
    ).catch((error) => app.log.warn({ error }, 'driver order push failed'));
    notifyMessengers(
      notifyDriversInMessengers(
        driverIds,
        driverRideNotification(
          order,
          options.delayed
            ? { title: 'Новый заказ доступен', body: 'Приоритетные водители не приняли заказ.' }
            : options.priceIncreased
              ? { icon: '💰', title: 'Цена повышена' }
              : undefined,
        ),
      ),
      options.delayed ? 'order.priority-released.drivers' : 'order.available.drivers',
    );
  };
  const announcePromotedDriverOrder = async (
    promotion: DriverQueuePromotion,
    driverId: string,
  ): Promise<void> => {
    if (!promotion) return;
    const row = await getOrder(promotion.id);
    if (!row) return;
    const payload = presentOrder(row);
    publish(`user:${promotion.passengerId}`, 'order:updated', payload);
    publish(`driver:${driverId}`, 'order:updated', payload);
    publish('admins', 'order:updated', payload);
    void notifyUsers([promotion.passengerId], {
      title: 'Водитель освободился',
      body: 'Предыдущая поездка завершена — водитель может выезжать к вам.',
      data: { orderId: promotion.id },
      sound: 'taxi_found.wav',
      channelId: 'ride-taxi-found-v2',
    }).catch((error) => app.log.warn({ error }, 'promoted order push failed'));
    void notifyDrivers([driverId], {
      title: 'Следующий заказ стал текущим',
      body: 'Откройте заказ и выезжайте к пассажиру.',
      data: { orderId: promotion.id, role: 'driver' },
      sound: 'new_order.wav',
      channelId: 'driver-orders-v2',
    }).catch((error) => app.log.warn({ error }, 'promoted driver push failed'));
    notifyMessengers(
      notifyUsersInMessengers([promotion.passengerId], passengerRideNotification(payload, {
        title: 'Водитель освободился',
        body: 'Предыдущая поездка завершена — водитель может выезжать к вам.',
      })),
      'order.queue-promoted.passenger',
    );
    notifyMessengers(
      notifyDriversInMessengers([driverId], driverRideNotification(payload, {
        title: 'Следующий заказ стал текущим',
        body: 'Можно выезжать к пассажиру.',
      })),
      'order.queue-promoted.driver',
    );
  };
  const handleMessengerOrderAction = createMessengerOrderActionHandler(app);
  const expireStaleSearchingOrders = async (): Promise<number> => {
    const expired = await withTransaction(async (connection) => {
      const [rows] = await connection.query<OrderRow[]>(
        `SELECT * FROM orders
         WHERE status = 'searching' AND driver_id IS NULL
           AND created_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
         ORDER BY created_at ASC LIMIT 100 FOR UPDATE`,
        [config.ORDER_SEARCH_TTL_MINUTES],
      );
      for (const row of rows) {
        await connection.execute(
          `UPDATE orders SET status = 'cancelled', active_driver_id = NULL,
            cancelled_at = UTC_TIMESTAMP(3),
            cancellation_code = 'search_timeout', cancellation_reason = ?
           WHERE id = ?`,
          ['Свободный водитель не найден за отведённое время', row.id],
        );
        await connection.execute(
          `INSERT INTO order_events
            (order_id, event_type, from_status, to_status, payload)
           VALUES (?, 'order.search_expired', 'searching', 'cancelled', ?)`,
          [row.id, JSON.stringify({ timeoutMinutes: config.ORDER_SEARCH_TTL_MINUTES })],
        );
      }
      return rows.map((row) => ({ id: row.id, passengerId: row.passenger_id }));
    });

    for (const item of expired) {
      const row = await getOrder(item.id);
      if (!row) continue;
      const payload = presentOrder(row);
      publish(`user:${item.passengerId}`, 'order:updated', payload);
      publish('admins', 'order:updated', payload);
      const push = passengerRidePush(payload);
      if (push) {
        void notifyUsers([item.passengerId], {
          ...push,
          title: 'Поиск водителя завершён',
          body: 'За отведённое время свободный водитель не найден. Создайте новый заказ.',
        }).catch((error) => app.log.warn({ error }, 'expired order push failed'));
      }
      notifyMessengers(
        notifyUsersInMessengers([item.passengerId], passengerRideNotification(payload, {
          title: 'Поиск водителя завершён',
          body: 'Свободный водитель не найден. Создайте новый заказ, когда будете готовы повторить поиск.',
        })),
        'order.search_expired.passenger',
      );
      notifyMessengers(
        closeUnassignedDriverOrderOffers(item.id, '', 'expired'),
        'order.search_expired.drivers',
      );
    }
    return expired.length;
  };
  const releaseDuePriorityOrders = async (): Promise<number> => {
    const dueOrders = await withTransaction(async (connection) => {
      const [rows] = await connection.query<OrderRow[]>(
        `SELECT * FROM orders
         WHERE status = 'searching' AND driver_id IS NULL
           AND priority_released_at IS NULL
           AND priority_release_at <= UTC_TIMESTAMP(3)
         ORDER BY priority_release_at ASC LIMIT 100 FOR UPDATE`,
      );
      for (const row of rows) {
        await connection.execute(
          `UPDATE orders SET priority_released_at = UTC_TIMESTAMP(3)
           WHERE id = ? AND status = 'searching' AND driver_id IS NULL`,
          [row.id],
        );
      }
      return rows.map((row) => row.id);
    });
    for (const orderId of dueOrders) {
      const row = await getOrder(orderId);
      if (!row || row.status !== 'searching' || row.driver_id) continue;
      const driverIds = await eligibleDriverIdsForOrder(orderId, 'nonpriority');
      sendOrderToDrivers(presentOrder(row), driverIds, { delayed: true });
    }
    return dueOrders.length;
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
    '/v1/auth/vk-mini/session',
    {
      logLevel: 'warn',
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      requireVkMiniAppConfiguration();
      const session = await auth(request);
      const input = parse(vkMiniAppSessionSchema, request.body);
      const launch = verifyVkMiniAppLaunchParams({
        launchParams: input.launchParams,
        appId: config.VK_MINI_APP_ID,
        secret: config.VK_MINI_APP_SECRET,
        maxAgeSeconds: config.VK_MINI_APP_MAX_AGE_SECONDS,
      });
      const linked = await firstRow<RowDataPacket & { id: number }>(
        `SELECT id FROM user_messenger_accounts
         WHERE user_id = ? AND provider = 'vk' AND external_user_id = ? AND active = TRUE
         LIMIT 1`,
        [session.id, launch.userId],
      );
      return { data: { verified: Boolean(linked) } };
    },
  );

  app.post(
    '/v1/auth/vk-mini',
    {
      logLevel: 'warn',
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      requireVkMiniAppConfiguration();
      const input = parse(vkMiniAppAuthSchema, request.body);
      const launch = verifyVkMiniAppLaunchParams({
        launchParams: input.launchParams,
        appId: config.VK_MINI_APP_ID,
        secret: config.VK_MINI_APP_SECRET,
        maxAgeSeconds: config.VK_MINI_APP_MAX_AGE_SECONDS,
      });
      if (String(input.profile.id) !== launch.userId) {
        throw Object.assign(new Error('Профиль VK не совпадает с параметрами запуска'), {
          statusCode: 401,
          code: 'VK_MINI_APP_PROFILE_MISMATCH',
        });
      }
      const linkedAccount = await firstRow<RowDataPacket & {
        user_id: string;
        bot_contact_available: number | boolean;
      }>(
        `SELECT account.user_id, account.bot_contact_available
         FROM user_messenger_accounts account
         JOIN users user ON user.id = account.user_id AND user.deleted_at IS NULL
         WHERE account.provider = 'vk' AND account.external_user_id = ? AND account.active = TRUE
         LIMIT 1`,
        [launch.userId],
      );

      let phone: string | null = null;
      if (!linkedAccount) {
        if (!input.phoneNumber || !input.phoneSign || input.phoneVerified !== true) {
          throw Object.assign(
            new Error('Для первого входа разрешите VK передать номер телефона'),
            { statusCode: 409, code: 'VK_MINI_APP_PHONE_REQUIRED' },
          );
        }
        if (!verifyVkMiniAppPhone({
          appId: launch.appId,
          secret: config.VK_MINI_APP_SECRET,
          userId: launch.userId,
          phoneNumber: input.phoneNumber,
          sign: input.phoneSign,
        })) {
          throw Object.assign(new Error('VK не подтвердил переданный номер телефона'), {
            statusCode: 401,
            code: 'VK_MINI_APP_PHONE_INVALID',
          });
        }
        phone = normalizeRussianPhone(input.phoneNumber);
        if (!phone) {
          throw Object.assign(new Error('VK передал неподдерживаемый номер телефона'), {
            statusCode: 400,
            code: 'PHONE_INVALID',
          });
        }
      }

      const messagesAllowed = await checkVkMiniAppMessagesPermission(
        launch.userId,
        input.messagesPermissionGranted,
      ).catch((error) => {
        request.log.warn({ error }, 'VK Mini App message permission check failed');
        return Boolean(linkedAccount?.bot_contact_available);
      });
      const userId = await withTransaction(async (connection) => {
        const id = linkedAccount?.user_id
          ?? await findOrCreatePhoneUser(connection, phone!);
        await linkMessengerIdentity(connection, id, {
          provider: 'vk',
          externalUserId: launch.userId,
          chatId: launch.userId,
          firstName: input.profile.firstName,
          lastName: input.profile.lastName,
          botContactAvailable: messagesAllowed,
        });
        await connection.execute(
          `UPDATE users SET profile_completed_at = COALESCE(profile_completed_at, UTC_TIMESTAMP(3))
           WHERE id = ? AND TRIM(name) <> ''`,
          [id],
        );
        return id;
      });

      await syncUserAvatarFromRemoteUrlIfEmpty(userId, input.profile.avatarUrl).catch((error) =>
        request.log.warn({ error }, 'VK Mini App profile avatar sync failed'),
      );
      const user = await findUserWithRoles(userId);
      if (!user) {
        throw Object.assign(new Error('Пользователь не найден'), {
          statusCode: 404,
          code: 'USER_NOT_FOUND',
        });
      }
      return {
        data: {
          token: await signSession({ id: user.id, roles: user.roles }),
          user,
          legalConsentRequired: !(await withTransaction((connection) =>
            hasCurrentInitialConsents(connection, user.id))),
          messagesAllowed,
          communityId: Number(config.VK_COMMUNITY_ID),
        },
      };
    },
  );

  app.post(
    '/v1/auth/vk/start',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      requireVkConfiguration();
      const raw = request.body && typeof request.body === 'object'
        ? request.body as Record<string, unknown>
        : {};
      const rawPhone = typeof raw.phone === 'string' ? raw.phone : undefined;
      const rawInstallationId = typeof raw.installationId === 'string'
        ? raw.installationId
        : undefined;
      const identity = buildAuthIdentity(request.ip, rawPhone, rawInstallationId);
      const eventId = await createAuthAttempt({
        requestId: String(request.id),
        action: 'start_vk',
        identity,
        userAgent: request.headers['user-agent'],
      });
      let finalized = false;
      const finalize = async (outcome: string, challengeId?: string) => {
        await finishAuthAttempt(eventId, outcome, undefined, challengeId);
        finalized = true;
      };
      try {
        const input = parse(phoneAuthStartSchema, request.body);
        const phone = normalizeRussianPhone(input.phone);
        if (!phone) {
          await finalize('invalid_phone');
          throw Object.assign(new Error('Укажите российский мобильный номер'), {
            statusCode: 400,
            code: 'PHONE_INVALID',
          });
        }
        const challengeId = randomUUID();
        const stateToken = randomToken(32);
        const exchangeToken = randomToken(32);
        const codeVerifier = randomToken(48);
        const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
        const expiresAt = new Date(Date.now() + config.PHONE_CODE_TTL_MINUTES * 60_000);
        await db.execute(
          `INSERT INTO vk_auth_challenges
            (id, state_token, code_verifier, exchange_secret_hash, expected_phone,
             legal_acceptance, consent_ip, consent_user_agent, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            challengeId,
            stateToken,
            codeVerifier,
            sha256(exchangeToken),
            phone,
            JSON.stringify(input.legalAcceptance),
            identity.ipAddress,
            request.headers['user-agent']?.slice(0, 255) ?? null,
            expiresAt,
          ],
        );
        await finalize('vk_challenge_created', challengeId);
        return {
          data: {
            challengeId,
            exchangeToken,
            authorizationUrl: vkAuthorizationUrl({ state: stateToken, codeChallenge }),
            communityUrl: vkCommunityMessageUrl(config.VK_COMMUNITY_ID),
            expiresInSeconds: config.PHONE_CODE_TTL_MINUTES * 60,
          },
        };
      } catch (error) {
        if (!finalized) await finishAuthAttempt(eventId, 'internal_error').catch(() => undefined);
        throw error;
      }
    },
  );

  app.get('/v1/auth/vk/callback', { logLevel: 'warn' }, async (request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    void reply.type('text/html; charset=utf-8');
    let state: string | null = null;
    try {
      requireVkConfiguration();
      const input = parse(vkCallbackSchema, request.query);
      state = input.state;
      const challenge = await firstRow<
        RowDataPacket & { id: string; code_verifier: string; expected_phone: string; expires_at: Date | string }
      >(
        `SELECT id, code_verifier, expected_phone, expires_at
         FROM vk_auth_challenges WHERE state_token = ? LIMIT 1`,
        [input.state],
      );
      if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) {
        throw new Error('VK challenge is missing or expired');
      }
      const vkIdentity = await exchangeVkAuthorizationCode({
        code: input.code,
        codeVerifier: challenge.code_verifier,
        deviceId: input.device_id,
        state: input.state,
      });
      const matches = Boolean(vkIdentity.phone && vkIdentity.phone === challenge.expected_phone);
      await db.execute(
        `UPDATE vk_auth_challenges
         SET verified_phone = ?, vk_user_id = ?, vk_first_name = ?, vk_last_name = ?,
           vk_avatar_url = ?, failure_code = ?, verified_at = IF(?, UTC_TIMESTAMP(3), NULL)
         WHERE id = ? AND verified_at IS NULL`,
        [
          vkIdentity.phone,
          vkIdentity.userId,
          vkIdentity.firstName,
          vkIdentity.lastName,
          vkIdentity.avatarUrl,
          matches ? null : vkIdentity.phone ? 'PHONE_MISMATCH' : 'PHONE_NOT_SHARED',
          matches,
          challenge.id,
        ],
      );
      return reply.send(vkCallbackHtml(matches));
    } catch (error) {
      if (state) {
        await db.execute(
          `UPDATE vk_auth_challenges SET failure_code = 'VK_OAUTH_FAILED'
           WHERE state_token = ? AND verified_at IS NULL`,
          [state],
        ).catch(() => undefined);
      }
      request.log.warn({ error }, 'VK ID callback failed');
      return reply.send(vkCallbackHtml(false));
    }
  });

  app.post('/v1/auth/vk/status', async (request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    const input = parse(maxAuthStatusSchema, request.body);
    const preview = await firstRow<
      RowDataPacket & {
        exchange_secret_hash: string;
        verified_phone: string | null;
        failure_code: string | null;
        expires_at: Date | string;
        vk_user_id: string | null;
      }
    >(
      `SELECT exchange_secret_hash, verified_phone, failure_code, expires_at, vk_user_id
       FROM vk_auth_challenges WHERE id = ? LIMIT 1`,
      [input.challengeId],
    );
    if (!preview || !hashesMatch(preview.exchange_secret_hash, sha256(input.exchangeToken))) {
      throw Object.assign(new Error('Подтверждение VK не найдено'), {
        statusCode: 404,
        code: 'VK_CHALLENGE_NOT_FOUND',
      });
    }
    if (new Date(preview.expires_at).getTime() <= Date.now()) {
      return { data: { status: 'expired' as const } };
    }
    if (preview.failure_code) {
      return { data: { status: 'failed' as const, errorCode: preview.failure_code } };
    }
    if (!preview.verified_phone || !preview.vk_user_id) {
      return { data: { status: 'pending' as const } };
    }
    const messagesAllowed = await isVkMessagesAllowed(preview.vk_user_id).catch((error) => {
      request.log.warn({ error }, 'VK message permission check failed');
      return false;
    });
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
          vk_user_id: string | null;
          vk_first_name: string | null;
          vk_last_name: string | null;
          vk_avatar_url: string | null;
        })[]
      >(
        `SELECT exchange_secret_hash, expected_phone, verified_phone, failure_code,
           legal_acceptance, consent_ip, consent_user_agent, expires_at,
           vk_user_id, vk_first_name, vk_last_name, vk_avatar_url
         FROM vk_auth_challenges WHERE id = ? FOR UPDATE`,
        [input.challengeId],
      );
      const challenge = rows[0];
      if (!challenge || !hashesMatch(challenge.exchange_secret_hash, sha256(input.exchangeToken))) {
        throw Object.assign(new Error('Подтверждение VK не найдено'), {
          statusCode: 404,
          code: 'VK_CHALLENGE_NOT_FOUND',
        });
      }
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { status: 'expired' as const };
      }
      if (challenge.failure_code) {
        return { status: 'failed' as const, errorCode: challenge.failure_code };
      }
      if (!challenge.verified_phone || !challenge.vk_user_id) {
        return { status: 'pending' as const };
      }

      const userId = await findOrCreatePhoneUser(connection, challenge.expected_phone);
      await linkMessengerIdentity(connection, userId, {
        provider: 'vk',
        externalUserId: challenge.vk_user_id,
        chatId: challenge.vk_user_id,
        firstName: challenge.vk_first_name,
        lastName: challenge.vk_last_name,
        botContactAvailable: messagesAllowed,
      });
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
        'UPDATE vk_auth_challenges SET completed_at = UTC_TIMESTAMP(3) WHERE id = ?',
        [input.challengeId],
      );
      return { status: 'verified' as const, userId, avatarUrl: challenge.vk_avatar_url };
    });

    if (result.status !== 'verified') return { data: result };
    await syncUserAvatarFromRemoteUrlIfEmpty(result.userId, result.avatarUrl).catch((error) =>
      request.log.warn({ error }, 'VK profile avatar sync failed'),
    );
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
        communityPrompt: messagesAllowed
          ? undefined
          : { url: vkCommunityMessageUrl(config.VK_COMMUNITY_ID) },
      },
    };
  });

  app.post(
    '/v1/webhooks/vk',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (request, reply) => {
      requireVkConfiguration();
      const update = parse(vkCallbackUpdateSchema, request.body);
      if (String(update.group_id) !== config.VK_COMMUNITY_ID) {
        throw Object.assign(new Error('Неизвестное сообщество VK'), {
          statusCode: 401,
          code: 'VK_GROUP_MISMATCH',
        });
      }
      if (update.secret !== config.VK_CALLBACK_SECRET) {
        throw Object.assign(new Error('Недействительная подпись webhook VK'), {
          statusCode: 401,
          code: 'VK_WEBHOOK_UNAUTHORIZED',
        });
      }
      if (update.type === 'confirmation') {
        return reply.type('text/plain').send(config.VK_CALLBACK_CONFIRMATION);
      }

      if (update.type === 'message_new' && update.object?.message) {
        const message = update.object.message;
        const userId = String(message.from_id);
        const peerId = String(message.peer_id);
        const [result] = await db.execute<import('mysql2/promise').ResultSetHeader>(
          `UPDATE user_messenger_accounts
           SET chat_id = ?, active = TRUE, bot_contact_available = TRUE,
             last_seen_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
           WHERE provider = 'vk' AND external_user_id = ?`,
          [peerId, userId],
        );
        if (result.affectedRows > 0) {
          await sendVkMessage(peerId, {
            message: 'VK подключён к «Такси Грахово». Здесь будут приходить статусы поездок и доступные действия.',
          });
        } else {
          await sendVkMessage(peerId, {
            message: 'Чтобы подключить уведомления, войдите через VK в приложении «Такси Грахово»: https://taxigr.ru/sign-in',
          });
        }
      }

      if (
        (update.type === 'message_allow' || update.type === 'message_deny') &&
        update.object?.user_id != null
      ) {
        await db.execute(
          `UPDATE user_messenger_accounts
           SET active = TRUE, bot_contact_available = ?, updated_at = UTC_TIMESTAMP(3)
           WHERE provider = 'vk' AND external_user_id = ?`,
          [update.type === 'message_allow', String(update.object.user_id)],
        );
      }

      if (
        update.type === 'message_event' &&
        update.object?.event_id &&
        update.object.user_id != null &&
        update.object.peer_id != null
      ) {
        const userId = String(update.object.user_id);
        const peerId = String(update.object.peer_id);
        const data = typeof update.object.payload === 'string'
          ? update.object.payload
          : update.object.payload && typeof update.object.payload === 'object'
            ? String((update.object.payload as { data?: unknown }).data ?? '')
            : '';
        let actionResult: MessengerOrderActionResult;
        try {
          actionResult = await handleMessengerOrderAction({
            provider: 'vk',
            externalUserId: userId,
            chatId: peerId,
            sourceMessageId: update.object.conversation_message_id == null
              ? undefined
              : `conversation:${update.object.conversation_message_id}`,
            data,
          });
        } catch (error) {
          request.log.warn({ error }, 'VK order callback failed');
          actionResult = { text: 'Не удалось выполнить действие. Повторите позже.', alert: true };
        }
        await answerVkMessageEvent({
          eventId: update.object.event_id,
          userId,
          peerId,
          text: actionResult.text,
        }).catch((error) => request.log.warn({ error }, 'VK callback answer failed'));
      }

      return reply.type('text/plain').send('ok');
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
      if (update.update_type === 'message_callback' && update.callback) {
        let result: MessengerOrderActionResult;
        try {
          result = await handleMessengerOrderAction({
            provider: 'max',
            externalUserId: String(update.callback.user.user_id),
            sourceMessageId: update.message?.body?.mid,
            data: update.callback.payload,
          });
        } catch (error) {
          request.log.warn({ error }, 'MAX order callback failed');
          result = {
            text: 'Не удалось выполнить действие. Повторите позже.',
            alert: true,
          };
        }
        await answerMaxCallback(update.callback.callback_id, result.text).catch((error) =>
          request.log.warn({ error }, 'MAX callback answer failed'),
        );
      }
      if (update.update_type === 'bot_started' && update.payload && update.user?.user_id != null) {
        const userId = String(update.user.user_id);
        const chatId = update.chat_id == null ? null : String(update.chat_id);
        const [result] = await db.execute<import('mysql2/promise').ResultSetHeader>(
          `UPDATE max_auth_challenges
           SET max_user_id = ?, max_chat_id = ?, max_avatar_url = ?, max_username = ?,
             max_display_name = ?, failure_code = NULL
           WHERE payload_token = ? AND expires_at > UTC_TIMESTAMP(3)
             AND verified_at IS NULL`,
          [
            userId,
            chatId,
            update.user.full_avatar_url ?? update.user.avatar_url ?? null,
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
          max_avatar_url: string | null;
        })[]
      >(
        `SELECT exchange_secret_hash, expected_phone, verified_phone, failure_code,
           legal_acceptance, consent_ip, consent_user_agent, expires_at,
           max_user_id, max_chat_id, max_username, max_display_name, max_avatar_url
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
      return {
        status: 'verified' as const,
        userId,
        avatarUrl: challenge.max_avatar_url,
        maxChatId: challenge.max_chat_id,
        maxUserId: challenge.max_user_id,
      };
    });

    if (result.status !== 'verified') return { data: result };
    try {
      let avatarUrl = result.avatarUrl;
      if (
        !avatarUrl &&
        result.maxChatId &&
        result.maxUserId &&
        await userHasNoAvatar(result.userId)
      ) {
        avatarUrl = await getMaxDialogProfilePhotoUrl(result.maxChatId, result.maxUserId);
      }
      await syncUserAvatarFromRemoteUrlIfEmpty(result.userId, avatarUrl);
    } catch (error) {
      request.log.warn({ error }, 'MAX profile avatar sync failed');
    }
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

      await processTelegramUpdate(
        parse(telegramUpdateSchema, request.body),
        handleMessengerOrderAction,
      );

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
      return {
        status: 'verified' as const,
        userId,
        telegramUserId: challenge.telegram_user_id,
      };
    });

    if (result.status !== 'verified') return { data: result };
    if (result.telegramUserId && await userHasNoAvatar(result.userId)) {
      try {
        const avatarUrl = await getTelegramProfilePhotoUrl(result.telegramUserId);
        await syncUserAvatarFromRemoteUrlIfEmpty(result.userId, avatarUrl, {
          proxyUrl: config.TELEGRAM_PROXY_URL || undefined,
        });
      } catch (error) {
        request.log.warn({ error }, 'Telegram profile avatar sync failed');
      }
    }
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
    const session = await authenticate(request);
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

  const notificationChannelsForUser = async (userId: string) => {
    const providers = notificationChannelProviderSchema.options;
    const [rows] = await db.query<(RowDataPacket & {
      provider: z.infer<typeof notificationChannelProviderSchema>;
      bot_contact_available: number | boolean;
      notifications_enabled: number | boolean;
    })[]>(
      `SELECT provider,
         MAX(bot_contact_available) AS bot_contact_available,
         MAX(notifications_enabled) AS notifications_enabled
       FROM user_messenger_accounts
       WHERE user_id = ? AND active = TRUE
       GROUP BY provider`,
      [userId],
    );
    const accountsByProvider = new Map(rows.map((row) => [row.provider, row]));
    return providers.map((provider) => {
      const account = accountsByProvider.get(provider);
      return {
        provider,
        connected: Boolean(account),
        available: Boolean(account?.bot_contact_available),
        enabled: Boolean(account?.notifications_enabled),
      };
    });
  };

  app.get('/v1/me/notification-channels', async (request) => {
    const session = await auth(request);
    return { data: { channels: await notificationChannelsForUser(session.id) } };
  });

  app.put('/v1/me/notification-channels', async (request) => {
    const session = await auth(request);
    const input = parse(notificationChannelSchema, request.body);
    await withTransaction(async (connection) => {
      if (input.enabled) {
        const [accounts] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM user_messenger_accounts
           WHERE user_id = ? AND provider = ? AND active = TRUE
             AND bot_contact_available = TRUE
           LIMIT 1 FOR UPDATE`,
          [session.id, input.provider],
        );
        if (!accounts.length) {
          throw Object.assign(new Error('Этот источник уведомлений пока недоступен'), {
            statusCode: 409,
            code: 'NOTIFICATION_CHANNEL_UNAVAILABLE',
          });
        }
      }
      await connection.execute(
        `UPDATE user_messenger_accounts
         SET notifications_enabled = ?
         WHERE user_id = ? AND provider = ? AND active = TRUE`,
        [input.enabled, session.id, input.provider],
      );
      await connection.execute(
        `UPDATE users SET notification_channels_configured_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND deleted_at IS NULL`,
        [session.id],
      );
    });
    return { data: { channels: await notificationChannelsForUser(session.id) } };
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
    const session = await authenticate(request);
    const user = await findUserWithRoles(session.id);
    if (!user) {
      throw Object.assign(new Error('Пользователь не найден'), {
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }
    const legalConsentRequired = !user.blockedAt &&
      !(await withTransaction((connection) => hasCurrentInitialConsents(connection, session.id)));
    return {
      data: {
        token: await signSession({ id: user.id, roles: user.roles }),
        user,
        legalConsentRequired,
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

  app.get('/v1/push/config', async (request) => {
    await auth(request);
    const vapid = getVapidConfig();
    return {
      data: {
        supported: true,
        vapidPublicKey: vapid.publicKey,
      },
    };
  });

  app.put('/v1/web-push-subscriptions', async (request) => {
    const session = await auth(request);
    const input = parse(
      z.object({
        endpoint: z.string().url().max(2048),
        expirationTime: z.number().int().nonnegative().nullable().optional(),
        keys: z.object({
          p256dh: z.string().min(20).max(255),
          auth: z.string().min(10).max(255),
        }),
      }),
      request.body,
    );
    await db.execute(
      `INSERT INTO web_push_subscriptions
        (endpoint_hash, user_id, endpoint, p256dh, auth_secret, expiration_time, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint),
         p256dh = VALUES(p256dh), auth_secret = VALUES(auth_secret),
         expiration_time = VALUES(expiration_time), user_agent = VALUES(user_agent)`,
      [
        sha256(input.endpoint),
        session.id,
        input.endpoint,
        input.keys.p256dh,
        input.keys.auth,
        input.expirationTime ?? null,
        request.headers['user-agent']?.slice(0, 512) ?? null,
      ],
    );
    return { data: { registered: true } };
  });

  app.post(
    '/v1/push/test',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request) => {
      const session = await auth(request);
      const delivered = await notifyUsers([session.id], {
        title: 'Тест push-уведомлений',
        body: 'Уведомления «Такси Грахово» подключены и работают.',
      });
      if (delivered.nativeSubscriptions + delivered.webSubscriptions === 0) {
        throw Object.assign(new Error('Для аккаунта ещё не зарегистрировано ни одного устройства'), {
          statusCode: 409,
          code: 'PUSH_NOT_REGISTERED',
        });
      }
      return { data: { sent: true, ...delivered } };
    },
  );

  app.get('/v1/addresses/search', async (request) => {
    await auth(request, 'passenger');
    const { query } = parse(z.object({ query: z.string().trim().min(2).max(180) }), request.query);
    const placeResults = (await searchPlaces(query)).map(placeToAddress);
    try {
      const addressResults = await searchAddresses(query);
      return { data: [...placeResults, ...addressResults].slice(0, 30) };
    } catch {
      if (placeResults.length) return { data: placeResults };
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
      const placeResults = (await searchPlaces(query)).map(placeToAddress);
      try {
        const addressResults = await searchAddresses(query);
        return { data: [...placeResults, ...addressResults].slice(0, 30) };
      } catch {
        if (placeResults.length) return { data: placeResults };
        throw Object.assign(new Error('Поиск адресов временно недоступен'), {
          statusCode: 502,
          code: 'GEOCODER_ERROR',
        });
      }
    },
  );

  app.get('/v1/places', async (request) => {
    const input = parse(
      z.object({
        query: z.string().trim().max(180).optional(),
        category: z.enum(placeCategories).optional(),
      }),
      request.query,
    );
    const places = input.query ? await searchPlaces(input.query, 100) : await listPlaces(false);
    return {
      data: input.category ? places.filter((place) => place.category === input.category) : places,
    };
  });

  app.post('/v1/quotes', async (request) => {
    const session = await auth(request, 'passenger');
    const input = parse(quoteSchema, request.body);
    const { pickup, destination, destinations } = await resolveTrustedAddresses(input);
    const pricingScope = classifyMultiStopPricingScope(pickup, destinations);
    const [pricedRoute, rules, etaMinutes] = await Promise.all([
      getMultiStopPricedRouteMetrics(pickup, destinations),
      pricingRules(),
      estimateTariffEtaMinutes(pickup),
    ]);
    const { tripRoute: route, segments, driverApproachRoute, pricingDistanceMeters } = pricedRoute;
    const pricedAt = new Date();
    const prices = multiStopPrices(
      pickup,
      destinations,
      segments.map((segment) => segment.route.distanceMeters),
      segments.map((segment) => segment.scope),
      driverApproachRoute?.distanceMeters ?? 0,
      rules,
      pricedAt,
    );
    const tariffs = quoteTariffs(
      pricingDistanceMeters,
      rules,
      pricingScope,
      driverApproachRoute !== null && pricingDistanceMeters > route.distanceMeters,
      pricedAt,
      etaMinutes,
      prices,
      destinations.length,
    );
    const quoteToken = await signOrderQuote({
      passengerId: session.id,
      pickup,
      destination,
      destinations,
      pricingScope,
      route: {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        source: route.source,
      },
      pricingDistanceMeters,
      driverApproachDistanceMeters: driverApproachRoute?.distanceMeters ?? 0,
      prices: {
        economy: prices.economy,
        child: prices.child,
      },
      pricedAt: pricedAt.toISOString(),
    });
    return {
      data: {
        quoteToken,
        route,
        pricingScope,
        pricingDistanceMeters,
        driverApproachDistanceMeters: driverApproachRoute?.distanceMeters ?? 0,
        tariffs,
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
      const { pickup, destinations } = await resolveTrustedAddresses(input);
      const pricingScope = classifyMultiStopPricingScope(pickup, destinations);
      const [pricedRoute, rules] = await Promise.all([
        getMultiStopPricedRouteMetrics(pickup, destinations),
        pricingRules(),
      ]);
      const { tripRoute: route, segments, driverApproachRoute, pricingDistanceMeters } = pricedRoute;
      const pricedAt = new Date();
      const prices = multiStopPrices(
        pickup,
        destinations,
        segments.map((segment) => segment.route.distanceMeters),
        segments.map((segment) => segment.scope),
        driverApproachRoute?.distanceMeters ?? 0,
        rules,
        pricedAt,
      );
      return {
        data: {
          route,
          pricingScope,
          pricingDistanceMeters,
          driverApproachDistanceMeters: driverApproachRoute?.distanceMeters ?? 0,
          tariffs: quoteTariffs(
            pricingDistanceMeters,
            rules,
            pricingScope,
            driverApproachRoute !== null && pricingDistanceMeters > route.distanceMeters,
            pricedAt,
            { economy: 10, child: 15 },
            prices,
            destinations.length,
          ),
          currency: 'RUB',
        },
      };
    },
  );

  app.post('/v1/orders', async (request, reply) => {
    const session = await auth(request, 'passenger');
    const input = parse(createOrderSchema, request.body);
    const existing = await firstRow<OrderRow>(
      `${orderSelect} WHERE o.passenger_id = ? AND o.idempotency_key = ?`,
      [session.id, input.idempotencyKey],
    );
    if (existing) return { data: presentOrder(existing) };

    let quote: Awaited<ReturnType<typeof verifyOrderQuote>>;
    try {
      quote = await verifyOrderQuote(input.quoteToken, session.id);
    } catch {
      throw Object.assign(new Error('Расчёт стоимости устарел. Обновите маршрут и попробуйте снова'), {
        statusCode: 409,
        code: 'QUOTE_EXPIRED_OR_INVALID',
      });
    }
    const submitted = await resolveTrustedAddresses(input);
    if (
      !addressesMatch(submitted.pickup, quote.pickup) ||
      submitted.destinations.length !== quote.destinations.length ||
      submitted.destinations.some(
        (destination, index) => !addressesMatch(destination, quote.destinations[index]!),
      )
    ) {
      throw Object.assign(new Error('Адреса изменились после расчёта стоимости'), {
        statusCode: 409,
        code: 'QUOTE_ADDRESS_MISMATCH',
      });
    }
    const { tripRoute: route } = await getMultiStopRouteMetrics(quote.pickup, quote.destinations);
    const { pricingDistanceMeters, pricingScope } = quote;
    const price = quote.prices[input.tariff];
    if (!Number.isSafeInteger(price) || price <= 0) {
      throw Object.assign(new Error('В расчёте отсутствует выбранный тариф'), {
        statusCode: 409,
        code: 'QUOTE_TARIFF_MISMATCH',
      });
    }
    const orderId = randomUUID();
    const hashedDevice = deviceFingerprint(input.deviceId, config.JWT_SECRET);
    const result = await withTransaction(async (connection) => {
      const [existingRows] = await connection.query<OrderRow[]>(
        `${orderSelect} WHERE o.passenger_id = ? AND o.idempotency_key = ?`,
        [session.id, input.idempotencyKey],
      );
      if (existingRows[0]) {
        return { order: presentOrder(existingRows[0]), created: false, initialDriverIds: [] };
      }

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
      if (!(await hasCurrentInitialConsents(connection, session.id))) {
        if (!input.legalAcceptance) {
          throw Object.assign(new Error('Примите условия сервиса перед первым заказом'), {
            statusCode: 403,
            code: 'LEGAL_CONSENT_REQUIRED',
          });
        }
        await recordInitialConsents(connection, session.id, input.legalAcceptance, {
          source: 'order_confirmation',
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }
      const rules = await pricingRules(connection);
      const commission = calculateCommissionMinor(price, rules.serviceCommissionBps);
      await connection.execute(
        `INSERT INTO orders (
          id, passenger_id, device_fingerprint, tariff, status, pricing_scope,
          pickup_label, pickup_details, pickup_lat, pickup_lon,
          destination_label, destination_details, destination_lat, destination_lon,
          destinations_json, distance_meters, duration_seconds, route_geometry,
          base_price_minor, price_minor, commission_minor, commission_bps,
          waiting_free_minutes, waiting_per_minute_minor,
          search_price_increase_interval_minutes, search_price_increase_step_minor,
          payment_method, comment, idempotency_key
        ) VALUES (?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          session.id,
          hashedDevice,
          input.tariff,
          pricingScope,
          quote.pickup.label,
          quote.pickup.details ?? null,
          quote.pickup.coordinates.latitude,
          quote.pickup.coordinates.longitude,
          quote.destination.label,
          quote.destination.details ?? null,
          quote.destination.coordinates.latitude,
          quote.destination.coordinates.longitude,
          JSON.stringify(quote.destinations),
          route.distanceMeters,
          route.durationSeconds,
          JSON.stringify(route.coordinates),
          price,
          price,
          commission,
          rules.serviceCommissionBps,
          rules.waitingFreeMinutes,
          rules.waitingPerMinuteMinor,
          rules.searchPriceIncreaseIntervalMinutes,
          rules.searchPriceIncreaseStepMinor,
          input.paymentMethod,
          input.comment ?? null,
          input.idempotencyKey,
        ],
      );
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, to_status, payload)
         VALUES (?, ?, 'order.created', 'searching', ?)`,
        [
          orderId,
          session.id,
          JSON.stringify({
            routeSource: route.source,
            pricingDistanceMeters,
            driverApproachDistanceMeters: quote.driverApproachDistanceMeters,
            quotePricedAt: quote.pricedAt,
          }),
        ],
      );
      const initialDriverIds = await preparePriorityDispatch(orderId, connection);
      const [insertedRows] = await connection.query<OrderRow[]>(
        `${orderSelect} WHERE o.id = ?`,
        [orderId],
      );
      const row = insertedRows[0];
      if (!row) throw new Error('Order insert failed');
      return { order: presentOrder(row), created: true, initialDriverIds };
    });
    if (result.created) {
      const eligibleDriverIds = result.initialDriverIds;
      sendOrderToDrivers(result.order, eligibleDriverIds);
      publish('admins', 'order:updated', result.order);
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
          ['Маршрут', formatMultiStopRouteLabel(
            result.order.pickup,
            result.order.destinations ?? [result.order.destination],
          )],
          ['Тариф', tariffLabels[result.order.tariff]],
          ['Стоимость', formatMoney(result.order.priceMinor)],
          ['Оплата', paymentMethodLabels[result.order.paymentMethod]],
          ['Комментарий', result.order.comment],
        ],
      });
      notifyMessengers(
        notifyUsersInMessengers([session.id], passengerRideNotification(result.order)),
        'order.created.passenger',
      );
      reply.code(201);
    }
    return { data: result.order };
  });

  app.get('/v1/bootstrap', async (request) => {
    const session = await auth(request);
    const [activePassengerResult, historyResult, driver, chatUnreadCounts] = await Promise.all([
      db.query<OrderRow[]>(
        `${orderSelect}
         WHERE o.passenger_id = ?
           AND o.status NOT IN ('completed', 'cancelled')
         ORDER BY o.created_at DESC LIMIT 1`,
        [session.id],
      ),
      db.query<DestinationHistoryRow[]>(
        `${destinationHistorySelect}
         WHERE o.passenger_id = ? AND o.status = 'completed'
         ORDER BY o.updated_at DESC LIMIT 100`,
        [session.id],
      ),
      session.roles.includes('driver') ? getDriver(session.id) : Promise.resolve(null),
      getRideChatUnreadCounts(session.id),
    ]);
    const activePassengerRow = activePassengerResult[0][0];
    const destinationHistory = buildDestinationHistory(
      historyResult[0].map(presentDestinationHistoryOrder),
      session.id,
    );
    let driverQueue: ReturnType<typeof selectDriverOrderQueue> = {
      current: null,
      next: null,
      offer: null,
    };

    if (driver) {
      const [assignedResult, offerRows] = await Promise.all([
        db.query<OrderRow[]>(
          `${orderSelect}
           WHERE o.driver_id = ?
             AND o.status IN ('accepted','driver_arriving','driver_waiting','in_progress')
           ORDER BY o.created_at ASC LIMIT ?`,
          [driver.id, maximumAssignedDriverOrders],
        ),
        loadDriverOfferRows(driver, 1),
      ]);
      const assignedOrders = assignedResult[0].map((row) =>
        limitOrderRatings(presentOrder(row), 'driver'),
      );
      const offers = offerRows.map((row) => limitOrderRatings(presentOrder(row), 'driver'));
      driverQueue = selectDriverOrderQueue(assignedOrders, offers);
    }

    return {
      data: {
        activePassengerOrder: activePassengerRow
          ? limitOrderRatings(presentOrder(activePassengerRow), 'passenger')
          : null,
        destinationHistory: destinationHistory.items.slice(0, 20),
        driverQueue,
        chatUnreadCounts,
      },
    };
  });

  app.get('/v1/orders', async (request) => {
    const session = await auth(request);
    const query = parse(
      z.object({
        status: z
          .enum([
            'searching',
            'accepted',
            'driver_arriving',
            'driver_waiting',
            'in_progress',
            'completed',
            'cancelled',
          ])
          .optional(),
        scope: z.enum(['passenger', 'driver']).optional(),
        before: z.iso.datetime({ offset: true }).optional(),
        beforeId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(100),
        view: z.enum(['detail', 'summary']).default('detail'),
      }),
      request.query,
    );
    const isAdmin = session.roles.includes('admin');
    const driver = session.roles.includes('driver') ? await getDriver(session.id) : null;
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (query.scope === 'passenger') {
      clauses.push('o.passenger_id = ?');
      values.push(session.id);
    } else if (query.scope === 'driver') {
      if (!driver) {
        throw Object.assign(new Error('Доступно только водителю'), {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
      clauses.push('o.driver_id = ?');
      values.push(driver.id);
    } else if (!isAdmin) {
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
    if (query.before) {
      if (query.beforeId) {
        clauses.push('(o.created_at < ? OR (o.created_at = ? AND o.id < ?))');
        const before = new Date(query.before);
        values.push(before, before, query.beforeId);
      } else {
        clauses.push('o.created_at < ?');
        values.push(new Date(query.before));
      }
    }
    values.push(query.limit);
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    if (query.view === 'summary') {
      const [rows] = await db.query<OrderSummaryRow[]>(
        `${orderSummarySelect}${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`,
        values,
      );
      return { data: rows.map(presentOrderSummary) };
    }
    const [rows] = await db.query<OrderRow[]>(
      `${orderSelect}${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`,
      values,
    );
    return {
      data: rows.map((row) => limitOrderRatings(
        presentOrder(row),
        ratingViewerForOrder(row, session, driver?.id),
      )),
    };
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
    return {
      data: limitOrderRatings(
        presentOrder(row),
        ratingViewerForOrder(row, session, driver?.id),
      ),
    };
  });

  app.get('/v1/orders/:id/messages', async (request) => {
    const session = await auth(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const query = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      request.query,
    );
    const access = await getRideChatAccess(id, session);
    const [rows] = await db.query<RideChatMessageRow[]>(
      `${rideChatMessageSelect}
       WHERE message.order_id = ?
       ORDER BY message.created_at DESC, message.id DESC
       LIMIT ?`,
      [id, query.limit],
    );

    return {
      data: {
        orderId: id,
        orderStatus: access.row.order_status,
        viewerRole: access.viewerRole,
        counterpart: access.counterpart,
        participants: access.participants,
        messages: rows.reverse().map(presentRideChatMessage),
        canSend:
          access.viewerRole !== 'admin' &&
          canSendRideChatMessage(access.row.order_status),
      },
    };
  });

  app.post('/v1/orders/:id/messages/read', async (request) => {
    const session = await auth(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const access = await getRideChatAccess(id, session);
    if (access.viewerRole === 'admin') {
      throw Object.assign(new Error('Статус прочтения доступен только участникам поездки'), {
        statusCode: 403,
        code: 'ADMIN_RIDE_CHAT_READ_ONLY',
      });
    }
    const [latestRows] = await db.query<
      (RowDataPacket & { id: string; created_at: Date | string })[]
    >(
      `SELECT id, created_at
       FROM ride_chat_messages
       WHERE order_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [id],
    );
    const latest = latestRows[0];
    if (latest) {
      await db.execute(
        `INSERT INTO ride_chat_reads
          (order_id, user_id, last_read_message_id, last_read_created_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_read_message_id = CASE
             WHEN VALUES(last_read_created_at) > last_read_created_at
               OR (
                 VALUES(last_read_created_at) = last_read_created_at
                 AND VALUES(last_read_message_id) > last_read_message_id
               )
             THEN VALUES(last_read_message_id)
             ELSE last_read_message_id
           END,
           last_read_created_at = GREATEST(
             last_read_created_at,
             VALUES(last_read_created_at)
           ),
           updated_at = UTC_TIMESTAMP(3)`,
        [id, session.id, latest.id, latest.created_at],
      );
    }
    const payload = { orderId: id, userId: session.id, unreadCount: 0 };
    publish(`user:${session.id}`, 'ride-chat:read', payload);
    return { data: payload };
  });

  app.get('/v1/orders/:id/messages/:messageId/image', async (request, reply) => {
    const session = await auth(request);
    const { id, messageId } = parse(
      z.object({ id: z.string().uuid(), messageId: z.string().uuid() }),
      request.params,
    );
    await getRideChatAccess(id, session);
    const [rows] = await db.query<
      (RowDataPacket & { attachment_data: Buffer | null; attachment_mime: string | null })[]
    >(
      `SELECT attachment_data, attachment_mime
       FROM ride_chat_messages
       WHERE id = ? AND order_id = ?
       LIMIT 1`,
      [messageId, id],
    );
    const image = rows[0];
    if (!image?.attachment_data || !image.attachment_mime) {
      throw Object.assign(new Error('Фотография из сообщения не найдена'), {
        statusCode: 404,
        code: 'RIDE_CHAT_IMAGE_NOT_FOUND',
      });
    }
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', 'inline')
      .type(image.attachment_mime)
      .send(image.attachment_data);
  });

  app.post(
    '/v1/orders/:id/messages',
    {
      // A 5 MB binary image occupies about 6.7 MB after base64 encoding in JSON.
      bodyLimit: RIDE_CHAT_UPLOAD_BODY_MAX_BYTES,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = await auth(request);
      const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
      const input = parse(rideChatMessageSchema, request.body);
      const result = await withTransaction(async (connection) => {
        const access = await getRideChatAccess(id, session, connection, true);
        if (access.viewerRole === 'admin') {
          throw Object.assign(new Error('Администратор может только просматривать переписку'), {
            statusCode: 403,
            code: 'ADMIN_RIDE_CHAT_READ_ONLY',
          });
        }
        if (!canSendRideChatMessage(access.row.order_status)) {
          throw Object.assign(new Error('Чат закрыт: поездка уже завершена'), {
            statusCode: 409,
            code: 'RIDE_CHAT_CLOSED',
          });
        }
        const attachmentBytes = input.attachment
          ? decodeRideChatImage(input.attachment.base64, input.attachment.mimeType)
          : null;
        const attachmentSha256 = attachmentBytes
          ? createHash('sha256').update(attachmentBytes).digest('hex')
          : null;

        const [insertResult] = await connection.execute<
          import('mysql2/promise').ResultSetHeader
        >(
          `INSERT IGNORE INTO ride_chat_messages
            (id, order_id, sender_user_id, body, attachment_mime, attachment_data,
             attachment_size_bytes, attachment_width, attachment_height,
             attachment_file_name, attachment_sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.id,
            id,
            session.id,
            input.body,
            input.attachment?.mimeType ?? null,
            attachmentBytes,
            attachmentBytes?.length ?? null,
            input.attachment?.width ?? null,
            input.attachment?.height ?? null,
            input.attachment?.fileName ?? null,
            attachmentSha256,
          ],
        );
        const [messageRows] = await connection.query<RideChatMessageRow[]>(
          `${rideChatMessageSelect} WHERE message.id = ? LIMIT 1`,
          [input.id],
        );
        const messageRow = messageRows[0];
        const attachmentMatches = input.attachment
          ? messageRow?.attachment_sha256 === attachmentSha256 &&
            messageRow?.attachment_mime === input.attachment.mimeType &&
            Number(messageRow?.attachment_size_bytes) === attachmentBytes?.length
          : !messageRow?.attachment_mime && !messageRow?.attachment_sha256;
        if (
          !messageRow ||
          messageRow.order_id !== id ||
          messageRow.sender_user_id !== session.id ||
          messageRow.body !== input.body ||
          !attachmentMatches
        ) {
          throw Object.assign(new Error('Не удалось сохранить сообщение'), {
            statusCode: 409,
            code: 'RIDE_CHAT_MESSAGE_CONFLICT',
          });
        }

        return {
          access,
          message: presentRideChatMessage(messageRow),
          isNew: insertResult.affectedRows > 0,
        };
      });

      if (result.isNew) {
        publish(`user:${result.access.row.passenger_id}`, 'ride-chat:message', result.message);
        publish(`user:${result.access.row.driver_user_id}`, 'ride-chat:message', result.message);
        publish('admins', 'ride-chat:message', result.message);

        const recipientUserId = result.access.viewerRole === 'passenger'
          ? result.access.row.driver_user_id
          : result.access.row.passenger_id;
        const recipientRole: RideChatRole = result.access.viewerRole === 'passenger'
          ? 'driver'
          : 'passenger';
        void notifyUsers([recipientUserId!], rideChatPush(result.message, recipientRole)).catch((error) =>
          request.log.warn({ error, orderId: id }, 'ride chat push notification failed'),
        );
        notifyMessengers(
          notifyUsersInMessengers(
            [recipientUserId!],
            rideChatMessengerNotification(result.message, appUrl(`/chat/${id}`)),
          ),
          'ride.chat.message',
        );
      }

      reply.code(result.isNew ? 201 : 200);
      return { data: result.message };
    },
  );

  app.post('/v1/orders/:id/search-price-increase', async (request) => {
    const session = await auth(request, 'passenger');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!row) {
        throw Object.assign(new Error('Заказ не найден'), {
          statusCode: 404,
          code: 'ORDER_NOT_FOUND',
        });
      }
      if (row.passenger_id !== session.id) {
        throw Object.assign(new Error('Подтвердить повышение может только пассажир'), {
          statusCode: 403,
          code: 'PRICE_INCREASE_FORBIDDEN',
        });
      }
      if (row.status !== 'searching' || row.driver_id) {
        throw Object.assign(new Error('Водитель уже найден или поиск завершён'), {
          statusCode: 409,
          code: 'PRICE_INCREASE_NOT_AVAILABLE',
        });
      }
      const intervalMinutes = Number(row.search_price_increase_interval_minutes);
      const offerSlot = searchPriceIncreaseSlotAt(
        row.created_at,
        Date.now(),
        intervalMinutes,
      );
      if (offerSlot < 1) {
        throw Object.assign(new Error(`Повысить стоимость можно через ${intervalMinutes} мин поиска`), {
          statusCode: 409,
          code: 'PRICE_INCREASE_TOO_EARLY',
        });
      }
      if (offerSlot <= Number(row.search_price_increase_last_slot)) {
        return { changed: false, increaseMinor: 0 };
      }

      const increaseMinor = Number(row.search_price_increase_step_minor);
      const searchPriceIncreaseMinor =
        Number(row.search_price_increase_minor) + increaseMinor;
      const priceMinor = Number(row.price_minor) + increaseMinor;
      const commissionMinor = calculateCommissionMinor(
        priceMinor,
        Number(row.commission_bps),
      );
      await connection.execute(
        `UPDATE orders
         SET search_price_increase_minor = ?, search_price_increase_last_slot = ?,
             price_minor = ?, commission_minor = ?
         WHERE id = ?`,
        [searchPriceIncreaseMinor, offerSlot, priceMinor, commissionMinor, id],
      );
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, payload)
         VALUES (?, ?, 'order.search_price_increased', ?)`,
        [
          id,
          session.id,
          JSON.stringify({ increaseMinor, priceMinor, offerSlot }),
        ],
      );
      return { changed: true, increaseMinor };
    });

    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    if (result.changed) {
      publish(`user:${session.id}`, 'order:updated', payload);
      publish('admins', 'order:updated', payload);
      notifyAdmins({
        icon: '💰',
        title: 'Пассажир повысил стоимость заказа',
        actor: {
          role: 'пассажир',
          id: session.id,
          name: payload.passenger?.name,
          phone: payload.passenger?.phone,
        },
        entity: { label: 'Заказ', id },
        details: [
          ['Маршрут', formatMultiStopRouteLabel(payload.pickup, payload.destinations ?? [payload.destination])],
          ['Повышение', formatMoney(result.increaseMinor)],
          ['Новая стоимость', formatMoney(payload.priceMinor)],
        ],
      });
      if (payload.status === 'searching' && !payload.driverId) {
        const eligibleDriverIds = await eligibleDriverIdsForOrder(id, 'available');
        sendOrderToDrivers(payload, eligibleDriverIds, { priceIncreased: true });
      }
    }
    return { data: payload };
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
        const raterRole: 'passenger' | 'driver' | null =
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
        await recalculateRating(
          connection,
          rateeUserId,
          raterRole === 'passenger' ? 'driver' : 'passenger',
        );
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
      const raterPayload = limitOrderRatings(payload, participants.raterRole);
      publish(
        participants.raterRole === 'passenger'
          ? `user:${participants.passengerId}`
          : `driver:${participants.driverId}`,
        'order:updated',
        raterPayload,
      );
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
          ['Маршрут', formatMultiStopRouteLabel(payload.pickup, payload.destinations ?? [payload.destination])],
        ],
      });
      return { data: raterPayload };
    },
  );

  app.post('/v1/orders/:id/cancel', async (request) => {
    const session = await auth(request);
    const { id } = request.params as { id: string };
    const { reason } = parse(
      z.object({ reason: z.string().trim().min(3).max(500).optional() }),
      request.body ?? {},
    );
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
      const adminCancellation = session.roles.includes('admin') && row.passenger_id !== session.id;
      if (adminCancellation && !reason) {
        throw Object.assign(new Error('Укажите причину отмены заказа администратором'), {
          statusCode: 400,
          code: 'CANCELLATION_REASON_REQUIRED',
        });
      }
      if (
        (!adminCancellation && !canTransitionRide(row.status, 'cancelled')) ||
        (adminCancellation && ['completed', 'cancelled'].includes(row.status))
      ) {
        throw Object.assign(new Error('Эту поездку уже нельзя отменить'), { statusCode: 409 });
      }

      await connection.execute(
        `UPDATE orders SET status = 'cancelled', active_driver_id = NULL,
          cancelled_at = UTC_TIMESTAMP(3),
          waiting_started_at = NULL, cancellation_code = ?, cancellation_reason = ?
         WHERE id = ?`,
        [adminCancellation ? 'admin' : 'passenger', reason ?? null, id],
      );
      const promotion = row.driver_id
        ? await rebalanceDriverOrderQueue(connection, row.driver_id)
        : null;
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
             reason: reason ?? null,
           }),
        ],
      );

      let passengerBlocked = false;
      let passengerBlockHours: number | null = null;
      if (row.passenger_id === session.id) {
        const cancellationPolicy = await pricingRules(connection);
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
            cancellationPolicy.passengerCancellationWindowHours,
          ],
        );
        if (
          Number(countRows[0]?.cancellation_count ?? 0) >=
          cancellationPolicy.passengerCancellationLimit
        ) {
          passengerBlocked = true;
          passengerBlockHours = cancellationPolicy.passengerCancellationBlockHours;
          await connection.execute(
            `UPDATE users
             SET order_blocked_until = TIMESTAMPADD(HOUR, ?, UTC_TIMESTAMP(3)),
               order_block_reason = ?
             WHERE id = ?`,
            [
              cancellationPolicy.passengerCancellationBlockHours,
              `Частые отмены: ${cancellationPolicy.passengerCancellationLimit} за ${cancellationPolicy.passengerCancellationWindowHours} ч.`,
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
        passengerBlockHours,
        promotion,
      };
    });
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${participants.passengerId}`, 'order:updated', payload);
    if (participants.driverId) publish(`driver:${participants.driverId}`, 'order:updated', payload);
    publish('admins', 'order:updated', payload);
    if (participants.driverId) {
      await announcePromotedDriverOrder(participants.promotion, participants.driverId);
    }
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
        ['Причина', reason],
        ['Маршрут', formatMultiStopRouteLabel(payload.pickup, payload.destinations ?? [payload.destination])],
        ['Стоимость', formatMoney(payload.priceMinor)],
        ['Назначенный водитель', payload.driver?.name],
      ],
    });
    const cancelledPush = passengerRidePush(payload);
    if (cancelledPush) {
      void notifyUsers([participants.passengerId], cancelledPush).catch((error) =>
        app.log.warn({ error }, 'push notification failed'),
      );
    }
    if (participants.driverId) {
      void notifyDrivers([participants.driverId], {
        title: 'Заказ отменён',
        body: 'Заказ больше не активен',
        data: { orderId: id, role: 'driver' },
        sound: 'ride_cancelled.wav',
        channelId: 'ride-cancelled-v2',
      }).catch((error) => app.log.warn({ error }, 'push notification failed'));
    }
    notifyMessengers(
      notifyUsersInMessengers([participants.passengerId], passengerRideNotification(payload, {
        body: participants.initiatedBy === 'passenger'
          ? 'Вы отменили заказ.'
          : 'Заказ отменён администратором.',
        details: [
          ['Статус до отмены', rideStatusLabels[participants.fromStatus]],
          ['Ограничение', participants.passengerBlocked
            ? `${participants.passengerBlockHours} ч. из-за частых отмен`
            : null],
        ],
      })),
      'order.cancelled.passenger',
    );
    if (participants.driverId) {
      notifyMessengers(
        notifyDriversInMessengers([participants.driverId], driverRideNotification(payload)),
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
    const driver = await withTransaction(async (connection) => {
      const current = await getDriver(session.id, connection, true);
      if (!current) {
        throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
      }
      if (current.status === 'suspended') {
        throw Object.assign(new Error('Доступ водителя приостановлен'), { statusCode: 403 });
      }
      const [activeOrderRows] = await connection.query<(RowDataPacket & { id: string })[]>(
        `SELECT id FROM orders
         WHERE driver_id = ?
           AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')
         LIMIT 1 FOR UPDATE`,
        [current.id],
      );
      if (activeOrderRows[0]) {
        throw Object.assign(new Error('Нельзя менять статус смены во время активной поездки'), {
          statusCode: 409,
          code: 'ACTIVE_RIDE_IN_PROGRESS',
        });
      }
      await connection.execute(
        "UPDATE drivers SET status = ? WHERE id = ? AND status <> 'suspended'",
        [status, current.id],
      );
      if (status === 'online') await openDriverShift(current.id, connection);
      else await closeDriverShift(current.id, connection);
      return current;
    });
    lastDriverLocationAcceptedAt.delete(driver.id);
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
        userId: string;
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
      `SELECT d.id, d.user_id AS userId, u.name, u.phone, d.status, d.rating,
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
       WHERE driver_id = ? AND active_driver_id = ?
         AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')
       LIMIT 1`,
      [driver.id, driver.id],
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
      if (order.active_driver_id !== driver.id) {
        throw Object.assign(new Error('Сначала завершите текущую поездку'), {
          statusCode: 409,
          code: 'DRIVER_ORDER_QUEUED',
        });
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
      if (targetKind === 'destination') {
        const presentedOrder = presentOrder(order);
        const { tripRoute } = await getMultiStopRouteMetrics(
          {
            id: 'driver-current-location',
            label: 'Текущее положение водителя',
            coordinates: origin,
          },
          presentedOrder.destinations ?? [presentedOrder.destination],
        );
        return { data: { ...tripRoute, target: targetKind } };
      }
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
    const rows = await loadDriverOfferRows(driver);
    return { data: rows.map(presentOrder) };
  });

  app.post('/v1/driver/orders/:id/accept', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = request.params as { id: string };
    const updated = await withTransaction(async (connection) => {
      const driver = await getDriver(session.id, connection, true);
      if (!driver?.vehicle_id) {
        throw Object.assign(new Error('Добавьте активный автомобиль'), { statusCode: 409 });
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
      if (
        Date.now() - new Date(row.created_at).getTime() >=
        config.ORDER_SEARCH_TTL_MINUTES * 60_000
      ) {
        throw Object.assign(new Error('Время поиска по этому заказу истекло'), {
          statusCode: 409,
          code: 'ORDER_SEARCH_EXPIRED',
        });
      }
      if (!['online', 'busy'].includes(driver.status)) {
        throw Object.assign(new Error('Включите статус «На линии»'), { statusCode: 409 });
      }
      const [priorityRows] = await connection.query<(RowDataPacket & { assigned: number })[]>(
        `SELECT EXISTS(
           SELECT 1 FROM driver_priority_assignments
           WHERE driver_id = ? AND scope = ?
         ) AS assigned`,
        [driver.id, row.pricing_scope],
      );
      if (
        !canDriverReceivePriorityOrder(
          row.priority_release_at,
          Boolean(priorityRows[0]?.assigned),
        )
      ) {
        throw Object.assign(
          new Error('Заказ пока доступен только приоритетным водителям'),
          { statusCode: 403, code: 'ORDER_PRIORITY_DELAY' },
        );
      }
      const [activeRows] = await connection.query<
        (RowDataPacket & { id: string; active_driver_id: string | null })[]
      >(
        `SELECT id, active_driver_id FROM orders
         WHERE driver_id = ?
           AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')
         ORDER BY created_at ASC, id ASC
         LIMIT ? FOR UPDATE`,
        [driver.id, maximumAssignedDriverOrders],
      );
      if (activeRows.length >= maximumAssignedDriverOrders) {
        throw Object.assign(new Error('У вас уже есть текущий и следующий заказы'), {
          statusCode: 409,
          code: 'DRIVER_QUEUE_FULL',
        });
      }
      if (row.passenger_id === session.id) {
        throw Object.assign(new Error('Нельзя принять собственный заказ'), {
          statusCode: 409,
          code: 'SELF_ACCEPT_FORBIDDEN',
        });
      }
      const [rejectedRows] = await connection.query<(RowDataPacket & { rejected: number })[]>(
        `SELECT EXISTS(
           SELECT 1 FROM driver_order_rejections
           WHERE order_id = ? AND driver_id = ?
         ) AS rejected`,
        [id, driver.id],
      );
      if (rejectedRows[0]?.rejected) {
        throw Object.assign(new Error('Вы уже отказались от этого заказа'), {
          statusCode: 409,
          code: 'ORDER_PREVIOUSLY_REJECTED',
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
      const queuePosition = activeRows.length === 0 ? 1 : 2;
      const activeDriverId = queuePosition === 1 ? driver.id : null;
      await connection.execute(
        `UPDATE orders SET driver_id = ?, active_driver_id = ?, vehicle_id = ?, status = 'accepted',
          commission_minor = ?, commission_bps = ?
         WHERE id = ? AND status = 'searching'`,
        [driver.id, activeDriverId, driver.vehicle_id, commissionMinor, commissionBps, id],
      );
      await connection.execute("UPDATE drivers SET status = 'busy' WHERE id = ?", [driver.id]);
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, from_status, to_status)
         VALUES (?, ?, 'order.accepted', 'searching', 'accepted')`,
        [id, session.id],
      );
      return { passengerId: row.passenger_id, driverId: driver.id, queuePosition };
    });
    const row = await getOrder(id);
    if (!row) throw new Error('Order disappeared');
    const payload = presentOrder(row);
    publish(`user:${updated.passengerId}`, 'order:updated', payload);
    publish(`driver:${updated.driverId}`, 'order:updated', payload);
    publish('admins', 'order:updated', payload);
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
        ['Маршрут', formatMultiStopRouteLabel(payload.pickup, payload.destinations ?? [payload.destination])],
        ['Стоимость', formatMoney(payload.priceMinor)],
      ],
    });
    const acceptedPush = passengerRidePush(payload);
    if (acceptedPush) {
      void notifyUsers([updated.passengerId], acceptedPush).catch((error) =>
        app.log.warn({ error }, 'push notification failed'),
      );
    }
    notifyMessengers(
      notifyUsersInMessengers([updated.passengerId], passengerRideNotification(payload)),
      'order.accepted.passenger',
    );
    notifyMessengers(
      notifyDriversInMessengers([updated.driverId], driverRideNotification(payload)),
      'order.accepted.driver',
    );
    notifyMessengers(
      closeUnassignedDriverOrderOffers(id, session.id),
      'order.accepted.other_drivers',
    );
    return { data: payload };
  });

  app.post('/v1/driver/orders/:id/release', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const { reason } = parse(
      z.object({ reason: z.string().trim().min(3).max(500) }),
      request.body,
    );
    const participants = await withTransaction(async (connection) => {
      const driver = await getDriver(session.id, connection, true);
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!row || !driver || row.driver_id !== driver.id) {
        throw Object.assign(new Error('Заказ водителя не найден'), { statusCode: 404 });
      }
      if (!['accepted', 'driver_arriving', 'driver_waiting'].includes(row.status)) {
        throw Object.assign(new Error('После начала поездки отказ оформляет администратор'), {
          statusCode: 409,
          code: 'DRIVER_RELEASE_NOT_AVAILABLE',
        });
      }
      const rules = await pricingRules(connection);
      const resetPriceMinor =
        Number(row.base_price_minor) + Number(row.search_price_increase_minor);
      await connection.execute(
        `INSERT IGNORE INTO driver_order_rejections (order_id, driver_id) VALUES (?, ?)`,
        [id, driver.id],
      );
      await connection.execute(
        `UPDATE orders SET driver_id = NULL, active_driver_id = NULL,
          vehicle_id = NULL, status = 'searching',
          waiting_started_at = NULL, waiting_seconds = 0, waiting_price_minor = 0,
          price_minor = ?, commission_bps = ?, commission_minor = ?
         WHERE id = ?`,
        [
          resetPriceMinor,
          rules.serviceCommissionBps,
          calculateCommissionMinor(resetPriceMinor, rules.serviceCommissionBps),
          id,
        ],
      );
      const promotion = await rebalanceDriverOrderQueue(connection, driver.id);
      await connection.execute(
        `INSERT INTO order_events
          (order_id, actor_user_id, event_type, from_status, to_status, payload)
         VALUES (?, ?, 'driver.released', ?, 'searching', ?)`,
        [
          id,
          session.id,
          row.status,
          JSON.stringify({
            driverId: driver.id,
            reason,
            waivedWaitingMinor: Number(row.waiting_price_minor),
          }),
        ],
      );
      const initialDriverIds = await preparePriorityDispatch(id, connection);
      return {
        passengerId: row.passenger_id,
        driverId: driver.id,
        fromStatus: row.status,
        initialDriverIds,
        promotion,
      };
    });
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${participants.passengerId}`, 'order:updated', payload);
    publish(`driver:${participants.driverId}`, 'order:updated', payload);
    publish('admins', 'order:updated', payload);
    await announcePromotedDriverOrder(participants.promotion, participants.driverId);

    const eligibleDriverIds = participants.initialDriverIds.filter(
      (driverId) => driverId !== participants.driverId,
    );
    sendOrderToDrivers(payload, eligibleDriverIds);
    notifyMessengers(
      notifyUsersInMessengers([participants.passengerId], passengerRideNotification(payload, {
        title: 'Ищем другого водителя',
        body: 'Предыдущий водитель не сможет выполнить заказ. Поиск уже продолжен автоматически.',
      })),
      'order.driver_released.passenger',
    );
    notifyAdmins({
      icon: '⚠️',
      title: 'Водитель отказался от назначенного заказа',
      actor: { role: 'водитель', id: session.id },
      entity: { label: 'Заказ', id },
      details: [
        ['Статус до отказа', rideStatusLabels[participants.fromStatus]],
        ['Причина', reason],
        ['Маршрут', formatMultiStopRouteLabel(payload.pickup, payload.destinations ?? [payload.destination])],
      ],
    });
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
      if (row.status !== 'driver_waiting') {
        throw Object.assign(
          new Error('Ожидание можно включить только после прибытия к пассажиру'),
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
    publish('admins', 'order:updated', payload);
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
        notifyUsersInMessengers([participants.passengerId], passengerRideNotification(payload, {
          icon: '⏱️',
          title: 'Платное ожидание включено',
          body: `Бесплатно ${payload.waitingFreeMinutes ?? 0} мин., затем ${formatMoney(payload.waitingPerMinuteMinor ?? 0)}/мин.`,
        })),
        'waiting.started.passenger',
      );
      notifyMessengers(
        notifyDriversInMessengers([participants.driverId], driverRideNotification(payload, {
          icon: '⏱️',
          title: 'Ожидание включено',
        })),
        'waiting.started.driver',
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
      if (row.status !== 'driver_waiting') {
        throw Object.assign(
          new Error('Ожидание можно завершить только до начала поездки'),
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
    publish('admins', 'order:updated', payload);
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
        notifyUsersInMessengers([participants.passengerId], passengerRideNotification(payload, {
          icon: '⏹️',
          title: 'Ожидание завершено',
          body: `${Math.ceil(participants.settled.waitingSeconds / 60)} мин. · +${formatMoney(participants.settled.waitingPriceMinor)}`,
        })),
        'waiting.stopped.passenger',
      );
      notifyMessengers(
        notifyDriversInMessengers([participants.driverId], driverRideNotification(payload, {
          icon: '⏹️',
          title: 'Ожидание остановлено',
          body: `+${formatMoney(participants.settled.waitingPriceMinor)} · итого ${formatMoney(participants.settled.priceMinor)}`,
        })),
        'waiting.stopped.driver',
      );
    }
    return { data: payload };
  });

  app.post('/v1/driver/orders/:id/transition', async (request) => {
    const session = await auth(request, 'driver');
    const { id } = request.params as { id: string };
    const { status, paymentReceived } = parse(
      z.object({
        status: z.enum(['driver_arriving', 'driver_waiting', 'in_progress', 'completed']),
        paymentReceived: z.boolean().optional(),
      }),
      request.body,
    );
    const participants = await withTransaction(async (connection) => {
      const driver = await getDriver(session.id, connection, true);
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [id],
      );
      const row = rows[0];
      if (!driver || !row || row.driver_id !== driver.id) {
        throw Object.assign(new Error('Заказ водителя не найден'), { statusCode: 404 });
      }
      if (row.active_driver_id !== driver.id) {
        throw Object.assign(new Error('Сначала завершите текущую поездку'), {
          statusCode: 409,
          code: 'DRIVER_ORDER_QUEUED',
        });
      }
      if (!canTransitionRide(row.status, status)) {
        throw Object.assign(new Error('Недопустимый переход статуса'), {
          statusCode: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
      if (status === 'completed' && paymentReceived !== true) {
        throw Object.assign(new Error('Подтвердите получение оплаты перед завершением поездки'), {
          statusCode: 409,
          code: 'PAYMENT_CONFIRMATION_REQUIRED',
        });
      }
      if (status === 'driver_waiting') {
        const [locationRows] = await connection.query<
          (RowDataPacket & {
            latitude: number;
            longitude: number;
            accuracy_meters: number | null;
            recorded_at: Date | string;
          })[]
        >(
          `SELECT latitude, longitude, accuracy_meters, recorded_at
           FROM driver_locations WHERE driver_id = ? LIMIT 1 FOR UPDATE`,
          [driver.id],
        );
        const location = locationRows[0];
        const recordedAt = location ? new Date(location.recorded_at).getTime() : 0;
        if (!location || !Number.isFinite(recordedAt) || Date.now() - recordedAt > 120_000) {
          throw Object.assign(new Error('Не удалось подтвердить ваше местоположение у точки подачи'), {
            statusCode: 409,
            code: 'DRIVER_LOCATION_STALE',
          });
        }
        const distanceToPickup = haversineMeters(
          { latitude: Number(location.latitude), longitude: Number(location.longitude) },
          { latitude: Number(row.pickup_lat), longitude: Number(row.pickup_lon) },
        );
        const allowedDistance = Math.max(300, Number(location.accuracy_meters ?? 0) + 150);
        if (distanceToPickup > allowedDistance) {
          throw Object.assign(new Error('Отметить прибытие можно только рядом с точкой подачи'), {
            statusCode: 409,
            code: 'DRIVER_NOT_AT_PICKUP',
            details: {
              distanceMeters: Math.round(distanceToPickup),
              allowedDistanceMeters: Math.round(allowedDistance),
            },
          });
        }
      }
      if ((status === 'in_progress' || status === 'completed') && row.waiting_started_at) {
        await settleWaiting(connection, row);
      }
      await connection.execute(
        `UPDATE orders SET status = ?,
          active_driver_id = IF(? = 'completed', NULL, active_driver_id),
          completed_at = IF(? = 'completed', UTC_TIMESTAMP(3), completed_at),
          payment_confirmed_at = IF(? = 'completed', UTC_TIMESTAMP(3), payment_confirmed_at)
         WHERE id = ?`,
        [status, status, status, status, id],
      );
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, from_status, to_status)
         VALUES (?, ?, 'order.transition', ?, ?)`,
        [id, session.id, row.status, status],
      );
      let promotion: DriverQueuePromotion = null;
      if (status === 'completed') {
        promotion = await rebalanceDriverOrderQueue(connection, driver.id);
        await connection.execute('DELETE FROM passenger_locations WHERE order_id = ?', [id]);
      }
      return { passengerId: row.passenger_id, driverId: driver.id, promotion };
    });
    const updated = await getOrder(id);
    if (!updated) throw new Error('Order disappeared');
    const payload = presentOrder(updated);
    publish(`user:${participants.passengerId}`, 'order:updated', payload);
    publish(`driver:${participants.driverId}`, 'order:updated', payload);
    publish('admins', 'order:updated', payload);
    await announcePromotedDriverOrder(participants.promotion, participants.driverId);
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
        ['Маршрут', formatMultiStopRouteLabel(payload.pickup, payload.destinations ?? [payload.destination])],
        ['Стоимость', status === 'completed' ? formatMoney(payload.priceMinor) : null],
        ['Ожидание', status === 'completed' && (payload.waitingPriceMinor ?? 0) > 0
          ? formatMoney(payload.waitingPriceMinor ?? 0)
          : null],
        ['Комиссия сервиса', status === 'completed'
          ? formatMoney(payload.serviceCommissionMinor)
          : null],
      ],
    });
    const statusPush = passengerRidePush(payload);
    if (statusPush) {
      void notifyUsers([participants.passengerId], statusPush).catch((error) =>
        app.log.warn({ error }, 'push notification failed'),
      );
    }
    notifyMessengers(
      notifyUsersInMessengers([participants.passengerId], passengerRideNotification(payload)),
      `order.${status}.passenger`,
    );
    notifyMessengers(
      notifyDriversInMessengers([participants.driverId], driverRideNotification(payload)),
      `order.${status}.driver`,
    );
    return { data: payload };
  });

  app.get('/v1/driver/earnings', async (request) => {
    const session = await auth(request, 'driver');
    const driver = await getDriver(session.id);
    if (!driver) throw Object.assign(new Error('Профиль водителя не найден'), { statusCode: 404 });
    const { period } = parse(
      z.object({ period: z.enum(['today', 'week', 'month']).default('today') }),
      request.query,
    );
    const samaraDayStart =
      'DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 4 HOUR)';
    const periodStart = period === 'month'
      ? `DATE_SUB(${samaraDayStart}, INTERVAL 29 DAY)`
      : period === 'week'
        ? `DATE_SUB(${samaraDayStart}, INTERVAL 6 DAY)`
        : samaraDayStart;
    const row = await firstRow<
      RowDataPacket & { gross: number; commission: number; rides: number }
    >(
      `SELECT COALESCE(SUM(price_minor), 0) AS gross,
        COALESCE(SUM(commission_minor), 0) AS commission, COUNT(*) AS rides
       FROM orders WHERE driver_id = ? AND status = 'completed'
         AND completed_at >= ${periodStart}`,
      [driver.id],
    );
    const gross = row?.gross ?? 0;
    const commission = row?.commission ?? 0;
    const shift = await firstRow<RowDataPacket & { onlineSeconds: number }>(
      `SELECT COALESCE(SUM(
         TIMESTAMPDIFF(
           SECOND,
           GREATEST(started_at, ${periodStart}),
           LEAST(COALESCE(ended_at, UTC_TIMESTAMP(3)), UTC_TIMESTAMP(3))
         )
       ), 0) AS onlineSeconds
       FROM driver_shifts
       WHERE driver_id = ?
         AND started_at < UTC_TIMESTAMP(3)
          AND COALESCE(ended_at, UTC_TIMESTAMP(3)) >= ${periodStart}`,
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

  app.get('/v1/admin/places', async (request) => {
    await auth(request, 'admin');
    return { data: await listPlaces(true) };
  });

  app.post('/v1/admin/places', async (request, reply) => {
    const session = await auth(request, 'admin');
    const input = parse(placeInputSchema, request.body);
    const id = randomUUID();
    await db.execute(
      `INSERT INTO places (
        id, name, aliases_json, category, description, address_label, house_number,
        latitude, longitude, phone, website, social_links_json, photo_urls_json,
        schedule_json, active, source_name, source_url, source_checked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        JSON.stringify(input.aliases),
        input.category,
        input.description ?? null,
        input.addressLabel,
        input.houseNumber ?? null,
        input.coordinates.latitude,
        input.coordinates.longitude,
        input.phone ?? null,
        input.website ?? null,
        JSON.stringify(input.socialLinks),
        JSON.stringify(input.photoUrls),
        JSON.stringify(input.schedule),
        input.active,
        input.sourceName ?? null,
        input.sourceUrl ?? null,
        input.sourceCheckedAt ?? null,
      ],
    );
    const created = await findPlace(id);
    await audit(session.id, 'place.create', 'place', id, null, created, request.ip);
    publish('admins', 'place:created', created);
    void reply.code(201);
    return { data: created };
  });

  app.put('/v1/admin/places/:id', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const input = parse(placeInputSchema, request.body);
    const before = await findPlace(id);
    if (!before) {
      throw Object.assign(new Error('Место не найдено'), {
        statusCode: 404,
        code: 'PLACE_NOT_FOUND',
      });
    }
    await db.execute(
      `UPDATE places SET name = ?, aliases_json = ?, category = ?, description = ?,
       address_label = ?, house_number = ?, latitude = ?, longitude = ?, phone = ?,
       website = ?, social_links_json = ?, photo_urls_json = ?, schedule_json = ?,
       active = ?, source_name = ?, source_url = ?, source_checked_at = ? WHERE id = ?`,
      [
        input.name,
        JSON.stringify(input.aliases),
        input.category,
        input.description ?? null,
        input.addressLabel,
        input.houseNumber ?? null,
        input.coordinates.latitude,
        input.coordinates.longitude,
        input.phone ?? null,
        input.website ?? null,
        JSON.stringify(input.socialLinks),
        JSON.stringify(input.photoUrls),
        JSON.stringify(input.schedule),
        input.active,
        input.sourceName ?? null,
        input.sourceUrl ?? null,
        input.sourceCheckedAt ?? null,
        id,
      ],
    );
    const updated = await findPlace(id);
    await audit(session.id, 'place.update', 'place', id, before, updated, request.ip);
    publish('admins', 'place:updated', updated);
    return { data: updated };
  });

  app.delete('/v1/admin/places/:id', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const before = await findPlace(id);
    if (!before) {
      throw Object.assign(new Error('Место не найдено'), {
        statusCode: 404,
        code: 'PLACE_NOT_FOUND',
      });
    }
    await db.execute('UPDATE places SET active = FALSE WHERE id = ?', [id]);
    const updated = await findPlace(id);
    await audit(session.id, 'place.disable', 'place', id, before, updated, request.ip);
    publish('admins', 'place:updated', updated);
    return { data: updated };
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
        WHERE status = 'completed'
          AND completed_at >= DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 4 HOUR)
       UNION ALL SELECT 'commissionTodayMinor', COALESCE(SUM(commission_minor), 0) FROM orders
        WHERE status = 'completed'
          AND completed_at >= DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 4 HOUR)`,
    );
    return { data: Object.fromEntries(rows.map((row) => [row.key_name, Number(row.value)])) };
  });

  app.get('/v1/admin/passengers', async (request) => {
    await auth(request, 'admin');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT u.id, u.id AS userId, u.name, u.phone, u.avatar_url AS avatarUrl,
        u.avatar_mime AS avatarMime, u.updated_at AS updatedAt,
        u.rating, u.rating_count AS ratingCount, u.created_at AS createdAt,
        u.blocked_at AS blockedAt, u.block_reason AS blockReason,
        COUNT(o.id) AS totalOrders,
        SUM(o.status = 'completed') AS completedOrders,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.price_minor ELSE 0 END), 0) AS grossMinor,
        MAX(o.created_at) AS lastOrderAt
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'passenger'
       LEFT JOIN orders o ON o.passenger_id = u.id
       WHERE u.deleted_at IS NULL
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    );
    return {
      data: rows.map((row) => ({
        id: String(row.id),
        userId: String(row.userId),
        name: String(row.name || 'Без имени'),
        phone: row.phone ? String(row.phone) : undefined,
        avatarUrl: row.avatarMime
          ? `/v1/users/${row.id}/avatar?v=${new Date(row.updatedAt as Date | string).getTime()}`
          : row.avatarUrl ?? undefined,
        rating: Number(row.rating ?? 5),
        ratingCount: Number(row.ratingCount ?? 0),
        totalOrders: Number(row.totalOrders ?? 0),
        completedOrders: Number(row.completedOrders ?? 0),
        grossMinor: Number(row.grossMinor ?? 0),
        createdAt: new Date(row.createdAt as Date | string).toISOString(),
        lastOrderAt: row.lastOrderAt
          ? new Date(row.lastOrderAt as Date | string).toISOString()
          : undefined,
        blockedAt: row.blockedAt
          ? new Date(row.blockedAt as Date | string).toISOString()
          : undefined,
        blockReason: row.blockReason ?? undefined,
      })),
    };
  });

  app.get('/v1/admin/passengers/:id', async (request) => {
    await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const user = await loadAdminAccountProfile(id);
    if (!user || !user.roles.includes('passenger')) {
      throw Object.assign(new Error('Пассажир не найден'), {
        statusCode: 404,
        code: 'PASSENGER_NOT_FOUND',
      });
    }
    const related = await loadAdminAccountData(id);
    return { data: { kind: 'passenger', user, ...related } };
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
          `INSERT INTO drivers (id, user_id, status, has_child_seat)
           VALUES (?, ?, 'online', ?)
           ON DUPLICATE KEY UPDATE has_child_seat = VALUES(has_child_seat)`,
          [driverId, application.user_id, application.has_child_seat],
        );
        const [drivers] = await connection.query<(RowDataPacket & { id: string; status: string })[]>(
          'SELECT id, status FROM drivers WHERE user_id = ?',
          [application.user_id],
        );
        const actualDriverId = drivers[0]!.id;
        if (drivers[0]!.status === 'online') {
          await openDriverShift(actualDriverId, connection);
        }
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
      `SELECT d.id, d.user_id AS userId, d.status, d.rating,
        d.rating_count AS ratingCount, d.commission_bps AS commissionBps,
        d.has_child_seat AS hasChildSeat, u.name, u.phone, u.avatar_url AS avatarUrl,
        u.avatar_mime AS avatarMime, u.updated_at AS updatedAt,
        u.blocked_at AS blockedAt, u.block_reason AS blockReason,
        v.make, v.model, v.year, v.color, v.color_hex AS colorHex, v.plate,
        d.created_at AS createdAt,
        EXISTS(SELECT 1 FROM driver_priority_assignments p
          WHERE p.driver_id = d.id AND p.scope = 'grahovo') AS priorityGrahovo,
        EXISTS(SELECT 1 FROM driver_priority_assignments p
          WHERE p.driver_id = d.id AND p.scope = 'district') AS priorityDistrict,
        EXISTS(SELECT 1 FROM driver_priority_assignments p
          WHERE p.driver_id = d.id AND p.scope = 'intercity') AS priorityIntercity,
        COALESCE(SUM(CASE WHEN o.status = 'completed' AND o.completed_at >= DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 4 HOUR)
          THEN o.price_minor ELSE 0 END), 0) AS grossTodayMinor,
        SUM(CASE WHEN o.status = 'completed' AND o.completed_at >= DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 4 HOUR)
          THEN 1 ELSE 0 END) AS ridesToday,
        COUNT(o.id) AS totalOrders,
        SUM(o.status = 'completed') AS completedOrders,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.price_minor ELSE 0 END), 0) AS grossMinor,
        MAX(o.created_at) AS lastOrderAt
       FROM drivers d JOIN users u ON u.id = d.user_id
       LEFT JOIN vehicles v ON v.driver_id = d.id AND v.active = TRUE
       LEFT JOIN orders o ON o.driver_id = d.id
       GROUP BY d.id, u.id, v.id
       ORDER BY d.created_at DESC`,
    );
    return {
      data: rows.map((row) => ({
        ...row,
        id: String(row.id),
        userId: String(row.userId),
        name: String(row.name || 'Без имени'),
        phone: row.phone ? String(row.phone) : undefined,
        avatarUrl: row.avatarMime
          ? `/v1/users/${row.userId}/avatar?v=${new Date(row.updatedAt as Date | string).getTime()}`
          : row.avatarUrl ?? undefined,
        rating: Number(row.rating ?? 5),
        ratingCount: Number(row.ratingCount ?? 0),
        hasChildSeat: Boolean(row.hasChildSeat),
        priorities: {
          grahovo: Boolean(row.priorityGrahovo),
          district: Boolean(row.priorityDistrict),
          intercity: Boolean(row.priorityIntercity),
        },
        totalOrders: Number(row.totalOrders ?? 0),
        completedOrders: Number(row.completedOrders ?? 0),
        grossMinor: Number(row.grossMinor ?? 0),
        grossTodayMinor: Number(row.grossTodayMinor ?? 0),
        ridesToday: Number(row.ridesToday ?? 0),
        createdAt: new Date(row.createdAt as Date | string).toISOString(),
        lastOrderAt: row.lastOrderAt
          ? new Date(row.lastOrderAt as Date | string).toISOString()
          : undefined,
        blockedAt: row.blockedAt
          ? new Date(row.blockedAt as Date | string).toISOString()
          : undefined,
        blockReason: row.blockReason ?? undefined,
      })),
    };
  });

  app.get('/v1/admin/drivers/:id', async (request) => {
    await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const driver = await firstRow<
      RowDataPacket & {
        id: string;
        user_id: string;
        status: 'online' | 'offline' | 'busy' | 'suspended';
        commission_bps: number | null;
        has_child_seat: number;
        priority_grahovo: number;
        priority_district: number;
        priority_intercity: number;
        approved_at: Date | string;
        make: string | null;
        model: string | null;
        year: number | null;
        color: string | null;
        color_hex: string | null;
        plate: string | null;
      }
    >(
      `SELECT d.id, d.user_id, d.status, d.commission_bps, d.has_child_seat,
        EXISTS(SELECT 1 FROM driver_priority_assignments p
          WHERE p.driver_id = d.id AND p.scope = 'grahovo') AS priority_grahovo,
        EXISTS(SELECT 1 FROM driver_priority_assignments p
          WHERE p.driver_id = d.id AND p.scope = 'district') AS priority_district,
        EXISTS(SELECT 1 FROM driver_priority_assignments p
          WHERE p.driver_id = d.id AND p.scope = 'intercity') AS priority_intercity,
        d.approved_at, v.make, v.model, v.year, v.color, v.color_hex, v.plate
       FROM drivers d
       LEFT JOIN vehicles v ON v.driver_id = d.id AND v.active = TRUE
       WHERE d.id = ?`,
      [id],
    );
    if (!driver) {
      throw Object.assign(new Error('Водитель не найден'), {
        statusCode: 404,
        code: 'DRIVER_NOT_FOUND',
      });
    }
    const user = await loadAdminAccountProfile(driver.user_id);
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
    const related = await loadAdminAccountData(driver.user_id, driver.id);
    const [shiftRows] = await db.query<RowDataPacket[]>(
      `SELECT id, started_at AS startedAt, ended_at AS endedAt,
        TIMESTAMPDIFF(MINUTE, started_at, COALESCE(ended_at, UTC_TIMESTAMP(3))) AS minutes
       FROM driver_shifts WHERE driver_id = ? ORDER BY started_at DESC LIMIT 100`,
      [driver.id],
    );
    const [vehicleRows] = await db.query<RowDataPacket[]>(
      `SELECT id, make, model, year, color, color_hex AS colorHex, plate,
        active, created_at AS createdAt
       FROM vehicles WHERE driver_id = ? ORDER BY active DESC, created_at DESC`,
      [driver.id],
    );
    const online = await firstRow<RowDataPacket & { minutes: number }>(
      `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, started_at,
        COALESCE(ended_at, UTC_TIMESTAMP(3)))), 0) AS minutes
       FROM driver_shifts WHERE driver_id = ?`,
      [driver.id],
    );
    related.stats.onlineMinutes = Number(online?.minutes ?? 0);
    return {
      data: {
        kind: 'driver',
        user,
        driver: {
          id: driver.id,
          status: driver.status,
          commissionBps: driver.commission_bps,
          hasChildSeat: Boolean(driver.has_child_seat),
          priorities: {
            grahovo: Boolean(driver.priority_grahovo),
            district: Boolean(driver.priority_district),
            intercity: Boolean(driver.priority_intercity),
          },
          approvedAt: new Date(driver.approved_at).toISOString(),
          vehicle:
            driver.make && driver.model && driver.year && driver.color && driver.color_hex && driver.plate
              ? {
                  make: driver.make,
                  model: driver.model,
                  year: Number(driver.year),
                  color: driver.color,
                  colorHex: driver.color_hex,
                  plate: driver.plate,
                }
              : undefined,
        },
        ...related,
        shifts: shiftRows.map((row) => ({
          id: Number(row.id),
          startedAt: new Date(row.startedAt as Date | string).toISOString(),
          endedAt: row.endedAt
            ? new Date(row.endedAt as Date | string).toISOString()
            : undefined,
          minutes: Number(row.minutes ?? 0),
        })),
        vehicles: vehicleRows.map((row) => ({
          id: String(row.id),
          make: String(row.make),
          model: String(row.model),
          year: Number(row.year),
          color: String(row.color),
          colorHex: String(row.colorHex),
          plate: String(row.plate),
          active: Boolean(row.active),
          createdAt: new Date(row.createdAt as Date | string).toISOString(),
        })),
      },
    };
  });

  app.patch('/v1/admin/drivers/:id', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const input = parse(
      z.object({
        status: z.enum(['offline', 'online', 'suspended']).optional(),
        commissionBps: z.number().int().min(0).max(5000).nullable().optional(),
        priorities: z
          .object({
            grahovo: z.boolean(),
            district: z.boolean(),
            intercity: z.boolean(),
          })
          .optional(),
      }),
      request.body,
    );
    const before = await withTransaction(async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          status: string;
          commission_bps: number | null;
          blocked_at: Date | string | null;
          priority_grahovo: number;
          priority_district: number;
          priority_intercity: number;
        })[]
      >(
        `SELECT d.status, d.commission_bps, u.blocked_at,
           EXISTS(SELECT 1 FROM driver_priority_assignments p
             WHERE p.driver_id = d.id AND p.scope = 'grahovo') AS priority_grahovo,
           EXISTS(SELECT 1 FROM driver_priority_assignments p
             WHERE p.driver_id = d.id AND p.scope = 'district') AS priority_district,
           EXISTS(SELECT 1 FROM driver_priority_assignments p
             WHERE p.driver_id = d.id AND p.scope = 'intercity') AS priority_intercity
         FROM drivers d JOIN users u ON u.id = d.user_id
         WHERE d.id = ? LIMIT 1 FOR UPDATE`,
        [id],
      );
      const current = rows[0];
      if (!current) throw Object.assign(new Error('Водитель не найден'), { statusCode: 404 });
      if (input.status === 'online' && current.blocked_at) {
        throw Object.assign(new Error('Сначала разблокируйте учётную запись водителя'), {
          statusCode: 409,
          code: 'DRIVER_ACCOUNT_BLOCKED',
        });
      }
      if (input.status === 'offline' || input.status === 'suspended') {
        const [activeRows] = await connection.query<(RowDataPacket & { id: string })[]>(
          `SELECT id FROM orders
           WHERE driver_id = ?
             AND status IN ('accepted','driver_arriving','driver_waiting','in_progress')
           LIMIT 1 FOR UPDATE`,
          [id],
        );
        if (activeRows[0]) {
          throw Object.assign(new Error('Сначала завершите или отмените активный заказ водителя'), {
            statusCode: 409,
            code: 'ACTIVE_RIDE_IN_PROGRESS',
          });
        }
      }
      await connection.execute(
        `UPDATE drivers SET status = COALESCE(?, status),
         commission_bps = CASE WHEN ? THEN ? ELSE commission_bps END WHERE id = ?`,
        [
          input.status ?? null,
          Object.prototype.hasOwnProperty.call(input, 'commissionBps'),
          input.commissionBps ?? null,
          id,
        ],
      );
      if (input.priorities) {
        await connection.execute('DELETE FROM driver_priority_assignments WHERE driver_id = ?', [id]);
        const selectedScopes = driverPriorityScopes.filter((scope) => input.priorities?.[scope]);
        for (const scope of selectedScopes) {
          await connection.execute(
            'INSERT INTO driver_priority_assignments (driver_id, scope) VALUES (?, ?)',
            [id, scope],
          );
        }
      }
      if (input.status === 'online') await openDriverShift(id, connection);
      else if (input.status === 'offline' || input.status === 'suspended') {
        await closeDriverShift(id, connection);
      }
      return current;
    });
    await audit(session.id, 'driver.update', 'driver', id, before, input, request.ip);
    if (
      input.status !== undefined ||
      Object.prototype.hasOwnProperty.call(input, 'commissionBps') ||
      input.priorities !== undefined
    ) {
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
            ['Приоритет', input.priorities
              ? driverPriorityScopes
                  .filter((scope) => input.priorities?.[scope])
                  .map((scope) => ({ grahovo: 'Грахово', district: 'район', intercity: 'межгород' })[scope])
                  .join(', ') || 'не назначен'
              : null],
          ],
          action: { label: 'Открыть профиль', url: appUrl('/driver/profile') },
        }),
        'driver.admin-updated',
      );
    }
    return { data: { id, ...input } };
  });

  app.patch('/v1/admin/users/:id/block', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const input = parse(
      z
        .object({
          blocked: z.boolean(),
          reason: z.string().trim().min(3).max(500).optional(),
        })
        .superRefine((value, context) => {
          if (value.blocked && !value.reason) {
            context.addIssue({
              code: 'custom',
              path: ['reason'],
              message: 'Укажите причину блокировки',
            });
          }
        }),
      request.body,
    );
    if (id === session.id) {
      throw Object.assign(new Error('Нельзя заблокировать собственную учётную запись'), {
        statusCode: 409,
        code: 'SELF_BLOCK_FORBIDDEN',
      });
    }
    const before = await firstRow<
      RowDataPacket & {
        name: string;
        blocked_at: Date | string | null;
        block_reason: string | null;
        is_admin: number;
        driver_id: string | null;
      }
    >(
      `SELECT u.name, u.blocked_at, u.block_reason,
        EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS is_admin,
        d.id AS driver_id
       FROM users u LEFT JOIN drivers d ON d.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id],
    );
    if (!before) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
    if (before.is_admin) {
      throw Object.assign(new Error('Учётные записи администраторов нельзя блокировать'), {
        statusCode: 409,
        code: 'ADMIN_BLOCK_FORBIDDEN',
      });
    }
    await withTransaction(async (connection) => {
      await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [id]);
      if (input.blocked) {
        const [activeRows] = await connection.query<(RowDataPacket & { id: string })[]>(
          `SELECT id FROM orders
           WHERE status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress')
             AND (passenger_id = ? OR driver_id = ?)
           LIMIT 1 FOR UPDATE`,
          [id, before.driver_id],
        );
        if (activeRows[0]) {
          throw Object.assign(new Error('Сначала отмените или завершите активный заказ пользователя'), {
            statusCode: 409,
            code: 'ACTIVE_ORDER_EXISTS',
          });
        }
      }
      if (input.blocked) {
        await connection.execute(
          `UPDATE users SET blocked_at = UTC_TIMESTAMP(3), block_reason = ?, blocked_by = ?
           WHERE id = ?`,
          [input.reason!, session.id, id],
        );
      } else {
        await connection.execute(
          `UPDATE users SET blocked_at = NULL, block_reason = NULL, blocked_by = NULL
           WHERE id = ?`,
          [id],
        );
      }
      if (before.driver_id) {
        await connection.execute(
          input.blocked
            ? "UPDATE drivers SET status = 'suspended' WHERE id = ?"
            : "UPDATE drivers SET status = 'offline' WHERE id = ? AND status = 'suspended'",
          [before.driver_id],
        );
        await closeDriverShift(before.driver_id, connection);
      }
    });
    const after = {
      blocked: input.blocked,
      reason: input.blocked ? input.reason : undefined,
    };
    await audit(
      session.id,
      input.blocked ? 'user.block' : 'user.unblock',
      'user',
      id,
      before,
      after,
      request.ip,
    );
    publish(`user:${id}`, 'account:access-changed', after);
    if (input.blocked) {
      realtime.disconnectUser(id);
    }
    if (input.blocked) {
      void notifyUsers([id], {
        title: 'Учётная запись заблокирована',
        body: input.reason!,
        data: { blocked: 'true' },
      }).catch((error) => app.log.warn({ error }, 'block push notification failed'));
    }
    return { data: { id, ...after } };
  });

  app.delete('/v1/admin/passengers/:id/order-block', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const before = await firstRow<
      RowDataPacket & {
        order_blocked_until: Date | string | null;
        order_block_reason: string | null;
        is_passenger: number;
      }
    >(
      `SELECT u.order_blocked_until, u.order_block_reason,
        EXISTS(
          SELECT 1 FROM user_roles role
          WHERE role.user_id = u.id AND role.role = 'passenger'
        ) AS is_passenger
       FROM users u
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id],
    );
    if (!before || !before.is_passenger) {
      throw Object.assign(new Error('Пассажир не найден'), {
        statusCode: 404,
        code: 'PASSENGER_NOT_FOUND',
      });
    }
    await db.execute(
      `UPDATE users
       SET order_blocked_until = NULL, order_block_reason = NULL
       WHERE id = ?`,
      [id],
    );
    const after = { orderBlockedUntil: null, orderBlockReason: null };
    await audit(
      session.id,
      'passenger.order-unblock',
      'user',
      id,
      before,
      after,
      request.ip,
    );
    publish(`user:${id}`, 'account:order-access-changed', after);
    return { data: { id, ...after } };
  });

  app.delete('/v1/admin/ratings/:id', async (request) => {
    const session = await auth(request, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const removed = await withTransaction(async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          id: string;
          order_id: string;
          rater_user_id: string;
          ratee_user_id: string;
          rater_role: 'passenger' | 'driver';
          score: number;
          passenger_id: string;
          driver_id: string | null;
        })[]
      >(
        `SELECT rr.*, o.passenger_id, o.driver_id
         FROM ride_ratings rr JOIN orders o ON o.id = rr.order_id
         WHERE rr.id = ? FOR UPDATE`,
        [id],
      );
      const rating = rows[0];
      if (!rating) {
        throw Object.assign(new Error('Оценка не найдена'), {
          statusCode: 404,
          code: 'RATING_NOT_FOUND',
        });
      }
      await connection.execute('DELETE FROM ride_ratings WHERE id = ?', [id]);
      await recalculateRating(
        connection,
        rating.ratee_user_id,
        rating.rater_role === 'passenger' ? 'driver' : 'passenger',
      );
      await connection.execute(
        `INSERT INTO order_events (order_id, actor_user_id, event_type, payload)
         VALUES (?, ?, 'rating.deleted', ?)`,
        [rating.order_id, session.id, JSON.stringify({ ratingId: id, score: rating.score })],
      );
      return rating;
    });
    await audit(session.id, 'rating.delete', 'ride_rating', id, removed, null, request.ip);
    const updatedOrder = await getOrder(removed.order_id);
    if (updatedOrder) {
      const payload = presentOrder(updatedOrder);
      publish(
        `user:${removed.passenger_id}`,
        'order:updated',
        limitOrderRatings(payload, 'passenger'),
      );
      if (removed.driver_id) {
        publish(
          `driver:${removed.driver_id}`,
          'order:updated',
          limitOrderRatings(payload, 'driver'),
        );
      }
    }
    return { data: { id, deleted: true } };
  });

  app.get('/v1/admin/tariffs', async (request) => {
    await auth(request, 'admin');
    return { data: await pricingRules() };
  });

  app.get('/v1/admin/driver-dispatch-settings', async (request) => {
    await auth(request, 'admin');
    return { data: await driverDispatchSettings() };
  });

  app.put('/v1/admin/driver-dispatch-settings', async (request) => {
    const session = await auth(request, 'admin');
    const input = parse(
      z.object({
        grahovo: z.number().int().min(0).max(120),
        district: z.number().int().min(0).max(120),
        intercity: z.number().int().min(0).max(120),
      }),
      request.body,
    );
    const before = await driverDispatchSettings();
    await withTransaction(async (connection) => {
      for (const scope of driverPriorityScopes) {
        await connection.execute(
          `INSERT INTO driver_dispatch_settings (scope, delay_minutes, updated_by)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE delay_minutes = VALUES(delay_minutes),
             updated_by = VALUES(updated_by)`,
          [scope, input[scope], session.id],
        );
      }
    });
    await audit(
      session.id,
      'driver_dispatch_settings.update',
      'driver_dispatch_settings',
      'all',
      before,
      input,
      request.ip,
    );
    publish('admins', 'driver-dispatch-settings:updated', input);
    return { data: input };
  });

  app.put('/v1/admin/tariffs', async (request) => {
    const session = await auth(request, 'admin');
    const input = parse(
      z.object({
        grahovoFare07To22Minor: z.number().int().min(0).max(1_000_000),
        grahovoFare22To02Minor: z.number().int().min(0).max(1_000_000),
        grahovoFare02To07Minor: z.number().int().min(0).max(1_000_000),
        districtPerKilometer07To22Minor: z.number().int().min(0).max(1_000_000),
        districtPerKilometer22To02Minor: z.number().int().min(0).max(1_000_000),
        districtPerKilometer02To07Minor: z.number().int().min(0).max(1_000_000),
        intercityPerKilometerMinor: z.number().int().min(0).max(1_000_000),
        childSurchargeMinor: z.number().int().min(0).max(1_000_000),
        additionalStopGrahovoSurchargeBps: z.number().int().min(0).max(20_000),
        waitingFreeMinutes: z.number().int().min(0).max(120),
        waitingPerMinuteMinor: z.number().int().min(0).max(100_000),
        searchPriceIncreaseIntervalMinutes: z.number().int().min(1).max(120),
        searchPriceIncreaseStepMinor: z.number().int().min(100).max(1_000_000),
        serviceCommissionBps: z.number().int().min(0).max(5000),
        passengerCancellationLimit: z.number().int().min(1).max(20),
        passengerCancellationWindowHours: z.number().int().min(1).max(720),
        passengerCancellationBlockHours: z.number().int().min(1).max(720),
      }),
      request.body,
    );
    const before = await pricingRules();
    await db.execute(
      `UPDATE tariff_settings SET grahovo_fare_07_22_minor = ?,
       grahovo_fare_22_02_minor = ?, grahovo_fare_02_07_minor = ?,
       district_per_kilometer_07_22_minor = ?,
       district_per_kilometer_22_02_minor = ?,
       district_per_kilometer_02_07_minor = ?,
       intercity_per_kilometer_minor = ?,
       child_surcharge_minor = ?, additional_stop_grahovo_surcharge_bps = ?,
       waiting_free_minutes = ?,
       waiting_per_minute_minor = ?, search_price_increase_interval_minutes = ?,
       search_price_increase_step_minor = ?, service_commission_bps = ?,
       passenger_cancellation_limit = ?, passenger_cancellation_window_hours = ?,
       passenger_cancellation_block_hours = ?,
       updated_by = ? WHERE id = 1`,
      [
        input.grahovoFare07To22Minor,
        input.grahovoFare22To02Minor,
        input.grahovoFare02To07Minor,
        input.districtPerKilometer07To22Minor,
        input.districtPerKilometer22To02Minor,
        input.districtPerKilometer02To07Minor,
        input.intercityPerKilometerMinor,
        input.childSurchargeMinor,
        input.additionalStopGrahovoSurchargeBps,
        input.waitingFreeMinutes,
        input.waitingPerMinuteMinor,
        input.searchPriceIncreaseIntervalMinutes,
        input.searchPriceIncreaseStepMinor,
        input.serviceCommissionBps,
        input.passengerCancellationLimit,
        input.passengerCancellationWindowHours,
        input.passengerCancellationBlockHours,
        session.id,
      ],
    );
    await audit(session.id, 'tariffs.update', 'tariff_settings', '1', before, input, request.ip);
    publish('admins', 'tariffs:updated', input);
    return { data: { currency: 'RUB', ...input } };
  });

  return {
    handleMessengerOrderAction,
    expireStaleSearchingOrders,
    releaseDuePriorityOrders,
  };
}
