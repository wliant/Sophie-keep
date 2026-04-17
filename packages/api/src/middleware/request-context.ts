import type { FastifyInstance } from 'fastify';
import { ulid } from '../util/ulid.js';

export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : ulid();
    reply.header('x-request-id', id);
    (req as unknown as { request_id: string }).request_id = id;
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (reply.request.url.startsWith('/api/')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });
}
