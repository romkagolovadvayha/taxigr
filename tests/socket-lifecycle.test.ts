import Fastify from 'fastify';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';

import { registerSocketLifecycle } from '../server/socket-lifecycle';

describe('API shutdown with realtime clients', () => {
  it.each(['websocket', 'polling'] as const)('closes promptly and reconnects an active %s client', async (transport) => {
    const app = Fastify();
    const io = new Server(app.server);
    registerSocketLifecycle(app, io);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const replacement = Fastify();
    const replacementIo = new Server(replacement.server);
    registerSocketLifecycle(replacement, replacementIo);
    const client = connectSocket(address, { transports: [transport], reconnectionDelay: 30, reconnectionDelayMax: 50, timeout: 1_000 });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', () => resolve());
        client.once('connect_error', reject);
      });
      expect(client.connected).toBe(true);
      const disconnected = new Promise<string>(resolve => client.once('disconnect', resolve));
      const result = await Promise.race([
        app.close().then(() => 'closed'),
        new Promise<string>(resolve => { deadline = setTimeout(() => resolve('timeout'), 1_500); }),
      ]);
      expect(result).toBe('closed');
      expect(app.server.listening).toBe(false);
      expect(io.engine.clientsCount).toBe(0);
      expect(await disconnected).not.toBe('io server disconnect');
      expect(client.active).toBe(true);
      clearTimeout(deadline);
      const reconnected = new Promise<string>(resolve => client.once('connect', () => resolve('connected')));
      await replacement.listen({ host: '127.0.0.1', port: Number(new URL(address).port) });
      expect(await Promise.race([
        reconnected,
        new Promise<string>(resolve => { deadline = setTimeout(() => resolve('timeout'), 1_500); }),
      ])).toBe('connected');
    } finally {
      clearTimeout(deadline);
      client.close();
      io.engine.close();
      await app.close();
      await replacement.close();
    }
  });
});
