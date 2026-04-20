import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { locationCreateZ, locationPatchZ } from '@sophie/shared';
import { getPool } from '../db/postgres.js';
import { parseId } from '../util/params.js';
import {
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  patchLocation,
} from '../services/locations-service.js';

export async function locationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/storage-locations', async (req) => {
    const q = z.object({ room_id: z.string().optional() }).parse(req.query);
    return { items: await listLocations(getPool(), q) };
  });

  app.post('/api/v1/storage-locations', async (req, reply) => {
    const body = locationCreateZ.parse(req.body);
    const l = await createLocation(getPool(), body);
    reply.status(201);
    return l;
  });

  app.get('/api/v1/storage-locations/:id', async (req) => {
    const id = parseId(req.params);
    return getLocation(getPool(), id);
  });

  app.patch('/api/v1/storage-locations/:id', async (req) => {
    const id = parseId(req.params);
    const body = locationPatchZ.parse(req.body);
    return patchLocation(getPool(), id, body);
  });

  app.delete('/api/v1/storage-locations/:id', async (req, reply) => {
    const id = parseId(req.params);
    await deleteLocation(getPool(), id);
    reply.status(204);
    return null;
  });
}
