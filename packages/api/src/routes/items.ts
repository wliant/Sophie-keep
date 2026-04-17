import type { FastifyInstance } from 'fastify';
import {
  itemCreateZ,
  itemPatchZ,
  quantityOpZ,
  itemSearchQueryZ,
  autocompleteQueryZ,
} from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import {
  createItem,
  deleteItem,
  enrichItem,
  getItem,
  listQuantityChanges,
  applyQuantityOp,
  patchItem,
  reorderPhotos,
} from '../services/items-service.js';
import { autocompleteItems, searchItems } from '../services/search-service.js';
import { z } from 'zod';
import { cleanupPhotoDirs } from '../services/photo-service.js';
import { parseId } from '../util/params.js';

export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/items', async (req) => {
    const q = itemSearchQueryZ.parse(req.query);
    return searchItems(getDb(), q);
  });

  app.get('/api/v1/items/autocomplete', async (req) => {
    const q = autocompleteQueryZ.parse(req.query);
    return { items: autocompleteItems(getDb(), q.q, q.limit ?? 5) };
  });

  app.post('/api/v1/items', async (req, reply) => {
    const body = itemCreateZ.parse(req.body);
    const item = createItem(getDb(), body);
    reply.status(201);
    return enrichItem(getDb(), item);
  });

  app.get('/api/v1/items/:id', async (req) => {
    const id = parseId(req.params);
    const item = getItem(getDb(), id);
    return {
      ...enrichItem(getDb(), item),
      quantity_changes: listQuantityChanges(getDb(), id, 10),
    };
  });

  app.patch('/api/v1/items/:id', async (req) => {
    const id = parseId(req.params);
    const body = itemPatchZ.parse(req.body);
    const item = patchItem(getDb(), id, body);
    return enrichItem(getDb(), item);
  });

  app.delete('/api/v1/items/:id', async (req, reply) => {
    const id = parseId(req.params);
    const { photoPaths } = deleteItem(getDb(), id);
    cleanupPhotoDirs(photoPaths);
    reply.status(204);
    return null;
  });

  app.post('/api/v1/items/:id/quantity', async (req) => {
    const id = parseId(req.params);
    const body = quantityOpZ.parse(req.body);
    const result = applyQuantityOp(
      getDb(),
      id,
      body.op,
      body.amount,
      body.reason ?? 'manual',
    );
    return {
      item: enrichItem(getDb(), result.item),
      change: result.change,
    };
  });

  app.post('/api/v1/items/:id/photos/order', async (req) => {
    const id = parseId(req.params);
    const body = z.object({ photo_ids: z.array(z.string()).max(10) }).parse(req.body);
    const item = reorderPhotos(getDb(), id, body.photo_ids);
    return enrichItem(getDb(), item);
  });
}
