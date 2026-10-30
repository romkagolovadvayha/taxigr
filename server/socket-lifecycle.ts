import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';

export function registerSocketLifecycle(app: FastifyInstance, io: Server): void {
  app.addHook('preClose', async () => {
    // Upgraded connections must close before Fastify waits for its HTTP server.
    // Doing this only in onClose leaves deployments waiting for systemd's kill timeout.
    // Close the transport without a namespace disconnect packet so existing
    // clients reconnect automatically when the replacement API starts.
    io.engine.close();
  });
  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
}
