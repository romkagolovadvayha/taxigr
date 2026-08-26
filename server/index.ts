import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';

import { pruneAuthAbuseData } from './auth-abuse';
import { config } from './config';
import { sendCriticalErrorReport } from './critical-telegram';
import { db } from './db';
import { registerRoutes } from './routes';
import { verifySession } from './security';
import { startTelegramPolling } from './telegram-polling';

const app = Fastify({
  logger: {
    level: config.isProduction ? 'info' : 'debug',
    redact: [
      'req.headers.authorization',
      'req.headers.x-api-key',
      'req.headers.x-max-bot-api-secret',
      'req.headers.x-telegram-bot-api-secret-token',
      'req.body.access_token',
      'req.body.code',
      'req.body.exchangeToken',
    ],
  },
  trustProxy: config.trustProxy,
  bodyLimit: 256 * 1024,
  requestTimeout: 15_000,
});

const reportCritical = (
  report: Parameters<typeof sendCriticalErrorReport>[0],
): void => {
  void sendCriticalErrorReport(report).catch((error) =>
    app.log.warn({ error }, 'Telegram critical notification failed'),
  );
};

await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
await app.register(cors, {
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
    else {
      callback(
        Object.assign(new Error('Origin is not allowed'), {
          statusCode: 403,
          code: 'CORS_ORIGIN_DENIED',
        }),
        false,
      );
    }
  },
  credentials: false,
});
await app.register(rateLimit, {
  max: config.GLOBAL_RATE_LIMIT_MAX,
  timeWindow: '1 minute',
  hook: 'onRequest',
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (_request, context) => {
    const retryAfterSeconds = Math.ceil(context.ttl / 1_000);
    return Object.assign(
      new Error(`Слишком много запросов. Повторите через ${retryAfterSeconds} сек.`),
      {
        statusCode: context.statusCode,
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds },
      },
    );
  },
});

app.addHook('onSend', async (request, reply, payload) => {
  if (request.headers.authorization?.startsWith('Bearer ')) {
    void reply
      .header('Cache-Control', 'private, no-store, max-age=0')
      .header('Pragma', 'no-cache')
      .header('Expires', '0');
  }
  return payload;
});

const io = new SocketServer(app.server, {
  path: '/socket.io',
  cors: { origin: config.corsOrigins },
  transports: ['websocket', 'polling'],
});

io.use(async (socket, next) => {
  try {
    const raw = socket.handshake.auth.token;
    if (typeof raw !== 'string') throw new Error('Missing token');
    const session = await verifySession(raw);
    const [rows] = await db.query<import('mysql2/promise').RowDataPacket[]>(
      `SELECT u.id, u.blocked_at, d.id AS driver_id
       FROM users u LEFT JOIN drivers d ON d.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
      [session.id],
    );
    if (!rows[0] || rows[0].blocked_at) throw new Error('Deleted, blocked or missing user');
    socket.data.session = session;
    socket.data.driverId = rows[0].driver_id ? String(rows[0].driver_id) : null;
    await socket.join(`user:${session.id}`);
    if (session.roles.includes('driver') && socket.data.driverId) {
      await socket.join(`driver:${String(socket.data.driverId)}`);
    }
    if (session.roles.includes('admin')) await socket.join('admins');
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

const routeHandlers = await registerRoutes(app, (room, event, payload) => {
  io.to(room).emit(event, payload);
}, {
  disconnectUser(userId) {
    setTimeout(() => io.in(`user:${userId}`).disconnectSockets(true), 0);
  },
});

const authAbusePruneTimer = setInterval(() => {
  void pruneAuthAbuseData().catch((error) => {
    app.log.error(error, 'auth abuse data pruning failed');
    reportCritical({
      source: 'server-process',
      error,
      context: [['Задача', 'auth abuse data pruning']],
    });
  });
}, 24 * 60 * 60 * 1_000);
(authAbusePruneTimer as unknown as { unref?: () => void }).unref?.();
void pruneAuthAbuseData().catch((error) => {
  app.log.error(error, 'initial auth abuse data pruning failed');
  reportCritical({
    source: 'server-process',
    error,
    context: [['Задача', 'initial auth abuse data pruning']],
  });
});

const staleOrderTimer = setInterval(() => {
  void routeHandlers.expireStaleSearchingOrders().catch((error) => {
    app.log.error(error, 'stale order expiration failed');
    reportCritical({
      source: 'server-process',
      error,
      context: [['Задача', 'stale order expiration']],
    });
  });
}, 60_000);
(staleOrderTimer as unknown as { unref?: () => void }).unref?.();
void routeHandlers.expireStaleSearchingOrders().catch((error) => {
  app.log.error(error, 'initial stale order expiration failed');
});

const priorityReleaseTimer = setInterval(() => {
  void routeHandlers.releaseDuePriorityOrders().catch((error) => {
    app.log.error(error, 'priority order release failed');
    reportCritical({
      source: 'server-process',
      error,
      context: [['Задача', 'priority order release']],
    });
  });
}, 5_000);
(priorityReleaseTimer as unknown as { unref?: () => void }).unref?.();
void routeHandlers.releaseDuePriorityOrders().catch((error) => {
  app.log.error(error, 'initial priority order release failed');
});

app.setErrorHandler((error, request, reply) => {
  const normalized = (() => {
    if (error instanceof Error) return error;
    if (error && typeof error === 'object') {
      const candidate = error as Record<string, unknown>;
      return Object.assign(
        new Error(typeof candidate.message === 'string' ? candidate.message : 'Unknown server error'),
        candidate,
        { cause: error },
      );
    }
    return Object.assign(new Error('Unknown server error'), { cause: error });
  })();
  const statusCode =
    'statusCode' in normalized && typeof normalized.statusCode === 'number' ? normalized.statusCode : 500;
  const code =
    'code' in normalized && typeof normalized.code === 'string'
      ? normalized.code
      : statusCode >= 500
        ? 'INTERNAL_ERROR'
        : 'REQUEST_ERROR';
  if (statusCode >= 500) {
    request.log.error(normalized);
    reportCritical({
      source: 'api',
      error: normalized,
      context: [
        ['HTTP', `${request.method} ${request.routeOptions.url ?? request.url}`],
        ['Статус', statusCode],
        ['Код', code],
        ['IP', request.ip],
        ['Origin', request.headers.origin],
        ['Request ID', request.id],
        ['User-Agent', request.headers['user-agent']],
      ],
    });
  } else {
    request.log.info(
      {
        code,
        message: normalized.message,
        method: request.method,
        url: request.routeOptions.url ?? request.url,
        origin: request.headers.origin,
      },
      'request rejected',
    );
  }
  void reply.code(statusCode).send({
    error: {
      code,
      message:
        statusCode >= 500 && config.isProduction ? 'Сервис временно недоступен' : normalized.message,
      ...('details' in normalized ? { details: normalized.details } : {}),
    },
  });
});

let stopTelegramPolling: (() => Promise<void>) | null = null;

app.addHook('onClose', async () => {
  clearInterval(authAbusePruneTimer);
  clearInterval(staleOrderTimer);
  clearInterval(priorityReleaseTimer);
  await stopTelegramPolling?.();
  io.close();
  await db.end();
});

let shuttingDown = false;
const shutdown = async (signal: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } finally {
    process.exit(exitCode);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  app.log.error({ error: reason }, 'unhandled promise rejection');
  reportCritical({
    source: 'server-process',
    error: reason,
    context: [['Событие', 'unhandledRejection']],
  });
});
process.on('uncaughtException', (error, origin) => {
  app.log.fatal({ error, origin }, 'uncaught exception');
  void Promise.race([
    sendCriticalErrorReport({
      source: 'server-process',
      error,
      context: [['Событие', 'uncaughtException'], ['Origin', origin]],
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ])
    .catch((reportError) => app.log.warn({ error: reportError }, 'fatal error report failed'))
    .finally(() => void shutdown('uncaughtException', 1));
});

await app.listen({ port: config.PORT, host: config.HOST });
if (config.TELEGRAM_UPDATE_MODE === 'polling') {
  stopTelegramPolling = startTelegramPolling(
    app.log,
    routeHandlers.handleMessengerOrderAction,
  );
}
