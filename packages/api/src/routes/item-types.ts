import type { FastifyInstance } from 'fastify';
import { itemTypeCreateZ, itemTypeMergeZ, itemTypePatchZ } from '@sophie/shared';
import { getPool } from '../db/postgres.js';
import { parseId } from '../util/params.js';
import {
  createType,
  deleteType,
  getType,
  listTypes,
  mergeType,
  patchType,
} from '../services/types-service.js';

export async function itemTypesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/item-types', async () => ({ items: await listTypes(getPool()) }));

  app.post('/api/v1/item-types', async (req, reply) => {
    const body = itemTypeCreateZ.parse(req.body);
    const t = await createType(getPool(), body);
    reply.status(201);
    return t;
  });

  app.get('/api/v1/item-types/:id', async (req) => {
    const id = parseId(req.params);
    return getType(getPool(), id);
  });

  app.patch('/api/v1/item-types/:id', async (req) => {
    const id = parseId(req.params);
    const body = itemTypePatchZ.parse(req.body);
    return patchType(getPool(), id, body);
  });

  app.delete('/api/v1/item-types/:id', async (req, reply) => {
    const id = parseId(req.params);
    await deleteType(getPool(), id);
    reply.status(204);
    return null;
  });

  app.post('/api/v1/item-types/:id/merge', async (req) => {
    const id = parseId(req.params);
    const body = itemTypeMergeZ.parse(req.body);
    return mergeType(getPool(), id, body.target_id);
  });
}
