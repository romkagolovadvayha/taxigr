import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';

import { pruneAuthAbuseData } from './auth-abuse';
import { config } from './config';
import { db } from './db';
import { registerRoutes } from './routes';
import { verifySession } from './security';

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

await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
await app.register(cors, {
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed'), false);
  },
  credentials: false,
});
await app.register(rateLimit, {
  max: config.GLOBAL_RATE_LIMIT_MAX,
  timeWindow: '1 minute',
  hook: 'onRequest',
  keyGenerator: (request) => request.ip,
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
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [session.id],
    );
    if (!rows[0]) throw new Error('Deleted or missing user');
    socket.data.session = session;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', async (socket) => {
  const session = socket.data.session as Awaited<ReturnType<typeof verifySession>>;
  void socket.join(`user:${session.id}`);
  if (session.roles.includes('driver')) {
    void socket.join('drivers');
    const [rows] = await db.query<import('mysql2/promise').RowDataPacket[]>(
      'SELECT id FROM drivers WHERE user_id = ? LIMIT 1',
      [session.id],
    );
    if (rows[0]?.id) void socket.join(`driver:${String(rows[0].id)}`);
  }
  if (session.roles.includes('admin')) void socket.join('admins');
});

await registerRoutes(app, (room, event, payload) => {
  io.to(room).emit(event, payload);
});

const authAbusePruneTimer = setInterval(() => {
  void pruneAuthAbuseData().catch((error) => app.log.error(error, 'auth abuse data pruning failed'));
}, 24 * 60 * 60 * 1_000);
authAbusePruneTimer.unref();
void pruneAuthAbuseData().catch((error) => app.log.error(error, 'initial auth abuse data pruning failed'));

app.setErrorHandler((error, request, reply) => {
  const normalized =
    error instanceof Error ? error : Object.assign(new Error('Unknown server error'), { cause: error });
  const statusCode =
    'statusCode' in normalized && typeof normalized.statusCode === 'number' ? normalized.statusCode : 500;
  const code =
    'code' in normalized && typeof normalized.code === 'string'
      ? normalized.code
      : statusCode >= 500
        ? 'INTERNAL_ERROR'
        : 'REQUEST_ERROR';
  if (statusCode >= 500) request.log.error(normalized);
  else request.log.info({ code, message: normalized.message }, 'request rejected');
  void reply.code(statusCode).send({
    error: {
      code,
      message:
        statusCode >= 500 && config.isProduction ? 'Сервис временно недоступен' : normalized.message,
      ...('details' in normalized ? { details: normalized.details } : {}),
    },
  });
});

app.addHook('onClose', async () => {
  clearInterval(authAbusePruneTimer);
  io.close();
  await db.end();
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
