import type { FastifyInstance } from 'fastify';

export function registerRequestContext(app: FastifyInstance): void {
  // Echo the request id (set by genReqId) in the response header so clients
  // can correlate with server logs. Keep Fastify's own reqId in logs aligned
  // with the value returned in error envelopes.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (reply.request.url.startsWith('/api/')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });
}
