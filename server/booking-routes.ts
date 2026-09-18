import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { readBookingSettings, saveBookingSettings } from './booking-settings';
import type { AuthUser } from './security';

const schema = z.object({ enabled: z.boolean() }).strict();

export function registerBookingRoutes(app: FastifyInstance, authenticateAdmin: (request: FastifyRequest) => Promise<AuthUser>) {
  app.get('/v1/booking-availability', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { data: await readBookingSettings() };
  });
  app.get('/v1/admin/booking-settings', async (request, reply) => {
    await authenticateAdmin(request);
    reply.header('Cache-Control', 'no-store');
    return { data: await readBookingSettings() };
  });
  app.put('/v1/admin/booking-settings', async (request) => {
    const session = await authenticateAdmin(request);
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw Object.assign(new Error('Передайте флажок enabled: true или false'), { statusCode: 400 });
    return { data: await saveBookingSettings(parsed.data, session.id, request.ip) };
  });
}
