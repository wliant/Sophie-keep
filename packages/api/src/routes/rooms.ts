import type { FastifyInstance } from 'fastify';
import { roomCreateZ, roomPatchZ } from '@sophie/shared';
import { getPool } from '../db/postgres.js';
import { parseId } from '../util/params.js';
import {
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  patchRoom,
} from '../services/locations-service.js';

export async function roomsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/rooms', async () => ({ items: await listRooms(getPool()) }));

  app.post('/api/v1/rooms', async (req, reply) => {
    const body = roomCreateZ.parse(req.body);
    const r = await createRoom(getPool(), body);
    reply.status(201);
    return r;
  });

  app.get('/api/v1/rooms/:id', async (req) => {
    const id = parseId(req.params);
    return getRoom(getPool(), id);
  });

  app.patch('/api/v1/rooms/:id', async (req) => {
    const id = parseId(req.params);
    const body = roomPatchZ.parse(req.body);
    return patchRoom(getPool(), id, body);
  });

  app.delete('/api/v1/rooms/:id', async (req, reply) => {
    const id = parseId(req.params);
    await deleteRoom(getPool(), id);
    reply.status(204);
    return null;
  });
}
