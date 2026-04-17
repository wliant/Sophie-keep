import type { FastifyInstance } from 'fastify';
import { SCHEMA_VERSION, APP_VERSION } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Back-compat summary probe used by the frontend System screen.
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    schema_version: SCHEMA_VERSION,
    app_version: APP_VERSION,
  }));

  // Liveness: the process is up and responding. No DB call — we don't want
  // transient DB issues to restart the container.
  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));

  // Readiness: the DB is open at the compiled schema version and accepts
  // queries. Orchestrators can use this to gate traffic.
  app.get('/api/v1/health/ready', async (_req, reply) => {
    try {
      const row = getDb()
        .prepare('SELECT version FROM schema_version')
        .get() as { version: number } | undefined;
      if (!row || row.version !== SCHEMA_VERSION) {
        reply.status(503);
        return {
          status: 'not_ready',
          reason: 'schema_version_mismatch',
          expected: SCHEMA_VERSION,
          actual: row?.version ?? null,
        };
      }
      return { status: 'ok', schema_version: row.version };
    } catch (e) {
      reply.status(503);
      return {
        status: 'not_ready',
        reason: 'db_unavailable',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });
}
