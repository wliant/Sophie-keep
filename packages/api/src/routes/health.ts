import type { FastifyInstance } from 'fastify';
import { SCHEMA_VERSION, APP_VERSION } from '@sophie/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    schema_version: SCHEMA_VERSION,
    app_version: APP_VERSION,
  }));
}
