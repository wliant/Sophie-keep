import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { roomCreateZ, roomPatchZ } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import {
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  patchRoom,
} from '../services/locations-service.js';

export async function roomsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/rooms', async () => ({ items: listRooms(getDb()) }));

  app.post('/api/v1/rooms', async (req, reply) => {
    const body = roomCreateZ.parse(req.body);
    const r = createRoom(getDb(), body);
    reply.status(201);
    return r;
  });

  app.get('/api/v1/rooms/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return getRoom(getDb(), id);
  });

  app.patch('/api/v1/rooms/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = roomPatchZ.parse(req.body);
    return patchRoom(getDb(), id, body);
  });

  app.delete('/api/v1/rooms/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    deleteRoom(getDb(), id);
    reply.status(204);
    return null;
  });
}
