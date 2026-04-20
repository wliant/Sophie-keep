import type { FastifyInstance } from 'fastify';
import { settingsPatchZ } from '@sophie/shared';
import { getPool } from '../db/postgres.js';
import { getSettings, patchSettings } from '../services/settings-service.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/settings', async () => getSettings(getPool()));
  app.patch('/api/v1/settings', async (req) => {
    const body = settingsPatchZ.parse(req.body);
    return patchSettings(getPool(), body);
  });
}
