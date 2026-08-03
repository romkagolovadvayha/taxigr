import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  MYSQL_URL: z.string().min(1).default('mysql://root@127.0.0.1:3306/taxi_grahovo'),
  JWT_SECRET: z.string().min(32).default('development-only-change-before-prod'),
  PUBLIC_URL: z.string().url().default('http://localhost:8081'),
  ROUTER_BASE_URL: z.string().url().or(z.literal('')).default('https://router.project-osrm.org'),
  ROUTER_TIMEOUT_MS: z.coerce.number().int().min(250).max(15_000).default(2_500),
  ROUTER_CACHE_TTL_SECONDS: z.coerce.number().int().min(10).max(86_400).default(600),
  ROUTER_CACHE_MAX_ENTRIES: z.coerce.number().int().min(10).max(20_000).default(2_000),
  ROUTER_CIRCUIT_BREAKER_SECONDS: z.coerce.number().int().min(1).max(600).default(30),
  NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  GEOCODER_CACHE_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SUPERADMIN_PHONES: z.string().default(''),
  EXPO_ACCESS_TOKEN: z.string().default(''),
  SMS_PROVIDER: z.enum(['console', 'notificore']).default('console'),
  NOTIFICORE_API_KEY: z.string().default(''),
  NOTIFICORE_BEARER_TOKEN: z.string().default(''),
  NOTIFICORE_TEMPLATE_ID: z.string().regex(/^\d{1,9}$/u).default('271'),
  NOTIFICORE_ORIGINATOR: z.string().max(11).default(''),
  MAX_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]*$/u).default(''),
  MAX_BOT_TOKEN: z.string().default(''),
  MAX_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]*$/u).default(''),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]*$/u).default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_ADMIN_CHAT_ID: z.string().regex(/^-?\d+$/u).default('-1004215180973'),
  TELEGRAM_CRITICAL_CHAT_ID: z.string().regex(/^-?\d+$/u).default('-1004442605510'),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]*$/u).default(''),
  TELEGRAM_UPDATE_MODE: z.enum(['webhook', 'polling']).default('webhook'),
  TELEGRAM_PROXY_URL: z
    .string()
    .url()
    .or(z.literal(''))
    .refine(
      (value) => !value || ['http:', 'https:'].includes(new URL(value).protocol),
      'Telegram proxy must use http:// or https://',
    )
    .default(''),
  PHONE_CODE_TTL_MINUTES: z.coerce.number().int().min(2).max(30).default(10),
  PHONE_CODE_RESEND_SECONDS: z.coerce.number().int().min(30).max(600).default(180),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(4).default(1),
  AUTH_ATTEMPT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().min(60).max(50_000).default(10_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid server configuration: ${details}`);
}

if (
  parsed.data.NODE_ENV === 'production' &&
  parsed.data.JWT_SECRET === 'development-only-change-before-prod'
) {
  throw new Error('Production requires a unique JWT_SECRET');
}

if (
  parsed.data.NODE_ENV === 'production' &&
  (
    parsed.data.SMS_PROVIDER !== 'notificore' ||
    (!parsed.data.NOTIFICORE_API_KEY && !parsed.data.NOTIFICORE_BEARER_TOKEN)
  )
) {
  throw new Error(
    'Production requires SMS_PROVIDER=notificore and a Notificore API key or bearer token',
  );
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  superadminPhones: new Set(
    parsed.data.SUPERADMIN_PHONES.split(',').map((phone) => phone.trim()).filter(Boolean),
  ),
  isProduction: parsed.data.NODE_ENV === 'production',
  trustProxy: parsed.data.NODE_ENV === 'production' ? parsed.data.TRUST_PROXY_HOPS : false,
};
