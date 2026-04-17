import type { FastifyInstance } from 'fastify';
import { settingsPatchZ } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import { getSettings, patchSettings } from '../services/settings-service.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/settings', async () => getSettings(getDb()));
  app.patch('/api/v1/settings', async (req) => {
    const body = settingsPatchZ.parse(req.body);
    return patchSettings(getDb(), body);
  });
}
