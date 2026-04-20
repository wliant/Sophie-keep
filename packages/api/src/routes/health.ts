import type { FastifyInstance } from 'fastify';
import { SCHEMA_VERSION, APP_VERSION } from '@sophie/shared';
import { getPool } from '../db/postgres.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    schema_version: SCHEMA_VERSION,
    app_version: APP_VERSION,
  }));

  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));

  app.get('/api/v1/health/ready', async (_req, reply) => {
    try {
      const { rows } = await getPool().query('SELECT version FROM schema_version');
      const row = rows[0] as { version: number } | undefined;
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
