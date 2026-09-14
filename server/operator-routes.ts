import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createOperatorDetailsSchema } from '../src/domain/operator-details';
import { readOperatorSettings, saveOperatorSettings } from './operator-settings';
import type { AuthUser } from './security';

const operatorDetailsSchema = createOperatorDetailsSchema(z);

export function registerOperatorRoutes(
  app: FastifyInstance,
  authenticateAdmin: (request: FastifyRequest) => Promise<AuthUser>,
) {
  app.get('/v1/operator-details', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { data: await readOperatorSettings() };
  });

  app.get('/v1/admin/operator-details', async (request) => {
    await authenticateAdmin(request);
    return { data: await readOperatorSettings() };
  });

  app.put('/v1/admin/operator-details', async (request) => {
    const session = await authenticateAdmin(request);
    const parsed = operatorDetailsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues.map((issue) => issue.message).join('; ')), {
        statusCode: 400, code: 'VALIDATION_ERROR',
      });
    }
    return { data: await saveOperatorSettings(parsed.data, session.id, request.ip) };
  });
}
