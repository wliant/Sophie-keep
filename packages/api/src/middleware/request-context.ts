import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    _startHr?: bigint;
  }
}

export function registerRequestContext(app: FastifyInstance): void {
  // Echo the request id (set by genReqId) in the response header so clients
  // can correlate with server logs. req.id comes from Fastify's genReqId,
  // which we configure to return a ULID in app.ts.
  app.addHook('onRequest', async (req, reply) => {
    req._startHr = process.hrtime.bigint();
    reply.header('x-request-id', req.id);
  });

  // Cache-Control on API responses (NFR-SEC / FR-API-006) and a compact
  // duration log line per request so operators can see latency without
  // external tooling.
  app.addHook('onResponse', async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      const start = req._startHr;
      const durMs =
        start != null ? Number(process.hrtime.bigint() - start) / 1_000_000 : undefined;
      req.log.info(
        {
          method: req.method,
          url: req.url,
          status: reply.statusCode,
          duration_ms: durMs != null ? Math.round(durMs * 100) / 100 : undefined,
        },
        'request',
      );
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });
}
