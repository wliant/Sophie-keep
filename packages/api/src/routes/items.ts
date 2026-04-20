import type { FastifyInstance } from 'fastify';
import {
  itemCreateZ,
  itemPatchZ,
  quantityOpZ,
  itemSearchQueryZ,
  autocompleteQueryZ,
} from '@sophie/shared';
import { getPool } from '../db/postgres.js';
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
import { cleanupPhotoKeys } from '../services/photo-service.js';
import { parseId } from '../util/params.js';

export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/items', async (req) => {
    const q = itemSearchQueryZ.parse(req.query);
    return searchItems(getPool(), q);
  });

  app.get('/api/v1/items/autocomplete', async (req) => {
    const q = autocompleteQueryZ.parse(req.query);
    return { items: await autocompleteItems(getPool(), q.q, q.limit ?? 5) };
  });

  app.post('/api/v1/items', async (req, reply) => {
    const body = itemCreateZ.parse(req.body);
    const item = await createItem(getPool(), body);
    reply.status(201);
    return enrichItem(getPool(), item);
  });

  app.get('/api/v1/items/:id', async (req) => {
    const id = parseId(req.params);
    const item = await getItem(getPool(), id);
    return {
      ...await enrichItem(getPool(), item),
      quantity_changes: await listQuantityChanges(getPool(), id, 10),
    };
  });

  app.patch('/api/v1/items/:id', async (req) => {
    const id = parseId(req.params);
    const body = itemPatchZ.parse(req.body);
    const item = await patchItem(getPool(), id, body);
    return enrichItem(getPool(), item);
  });

  app.delete('/api/v1/items/:id', async (req, reply) => {
    const id = parseId(req.params);
    const { photoKeyPrefixes } = await deleteItem(getPool(), id);
    await cleanupPhotoKeys(photoKeyPrefixes);
    reply.status(204);
    return null;
  });

  app.post('/api/v1/items/:id/quantity', async (req) => {
    const id = parseId(req.params);
    const body = quantityOpZ.parse(req.body);
    const result = await applyQuantityOp(
      getPool(),
      id,
      body.op,
      body.amount,
      body.reason ?? 'manual',
    );
    return {
      item: await enrichItem(getPool(), result.item),
      change: result.change,
    };
  });

  app.post('/api/v1/items/:id/photos/order', async (req) => {
    const id = parseId(req.params);
    const body = z.object({ photo_ids: z.array(z.string()).max(10) }).parse(req.body);
    const item = await reorderPhotos(getPool(), id, body.photo_ids);
    return enrichItem(getPool(), item);
  });
}
