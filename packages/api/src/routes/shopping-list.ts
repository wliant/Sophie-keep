import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  restockConfirmZ,
  shoppingAutoCheckZ,
  shoppingEntryCreateZ,
  shoppingEntryPatchZ,
} from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
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
  app.get('/api/v1/shopping-list', async () => getShoppingList(getDb()));

  app.post('/api/v1/shopping-list/entries', async (req, reply) => {
    const body = shoppingEntryCreateZ.parse(req.body);
    const entry = createManualEntry(getDb(), body.label);
    reply.status(201);
    return entry;
  });

  app.patch('/api/v1/shopping-list/entries/:id', async (req) => {
    const id = parseId(req.params);
    const body = shoppingEntryPatchZ.parse(req.body);
    return patchManualEntry(getDb(), id, body);
  });

  app.delete('/api/v1/shopping-list/entries/:id', async (req, reply) => {
    const id = parseId(req.params);
    deleteManualEntry(getDb(), id);
    reply.status(204);
    return null;
  });

  app.post('/api/v1/shopping-list/auto-check', async (req) => {
    const body = shoppingAutoCheckZ.parse(req.body);
    setAutoCheck(getDb(), body.item_id, body.checked);
    return { ok: true };
  });

  app.post('/api/v1/shopping-list/confirm-restock', async (req) => {
    const body = restockConfirmZ.parse(req.body);
    return confirmRestock(getDb(), body);
  });

  app.post('/api/v1/shopping-list/clear-checked', async () => {
    clearChecked(getDb());
    return { ok: true };
  });
}
