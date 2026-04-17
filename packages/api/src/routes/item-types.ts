import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { itemTypeCreateZ, itemTypeMergeZ, itemTypePatchZ } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import {
  createType,
  deleteType,
  getType,
  listTypes,
  mergeType,
  patchType,
} from '../services/types-service.js';

export async function itemTypesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/item-types', async () => ({ items: listTypes(getDb()) }));

  app.post('/api/v1/item-types', async (req, reply) => {
    const body = itemTypeCreateZ.parse(req.body);
    const t = createType(getDb(), body);
    reply.status(201);
    return t;
  });

  app.get('/api/v1/item-types/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return getType(getDb(), id);
  });

  app.patch('/api/v1/item-types/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = itemTypePatchZ.parse(req.body);
    return patchType(getDb(), id, body);
  });

  app.delete('/api/v1/item-types/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    deleteType(getDb(), id);
    reply.status(204);
    return null;
  });

  app.post('/api/v1/item-types/:id/merge', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = itemTypeMergeZ.parse(req.body);
    return mergeType(getDb(), id, body.target_id);
  });
}
