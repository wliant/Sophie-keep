import type { FastifyInstance } from 'fastify';
import {
  restockConfirmZ,
  shoppingAutoCheckZ,
  shoppingEntryCreateZ,
  shoppingEntryPatchZ,
} from '@sophie/shared';
import { getPool } from '../db/postgres.js';
import { parseId } from '../util/params.js';
import {
  clearChecked,
  confirmRestock,
  createManualEntry,
  deleteManualEntry,
  getShoppingList,
  patchManualEntry,
  setAutoCheck,
} from '../services/shopping-service.js';

export async function shoppingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/shopping-list', async () => getShoppingList(getPool()));

  app.post('/api/v1/shopping-list/entries', async (req, reply) => {
    const body = shoppingEntryCreateZ.parse(req.body);
    const entry = await createManualEntry(getPool(), body.label);
    reply.status(201);
    return entry;
  });

  app.patch('/api/v1/shopping-list/entries/:id', async (req) => {
    const id = parseId(req.params);
    const body = shoppingEntryPatchZ.parse(req.body);
    return patchManualEntry(getPool(), id, body);
  });

  app.delete('/api/v1/shopping-list/entries/:id', async (req, reply) => {
    const id = parseId(req.params);
    await deleteManualEntry(getPool(), id);
    reply.status(204);
    return null;
  });

  app.post('/api/v1/shopping-list/auto-check', async (req) => {
    const body = shoppingAutoCheckZ.parse(req.body);
    await setAutoCheck(getPool(), body.item_id, body.checked);
    return { ok: true };
  });

  app.post('/api/v1/shopping-list/confirm-restock', async (req) => {
    const body = restockConfirmZ.parse(req.body);
    return confirmRestock(getPool(), body);
  });

  app.post('/api/v1/shopping-list/clear-checked', async () => {
    await clearChecked(getPool());
    return { ok: true };
  });
}
