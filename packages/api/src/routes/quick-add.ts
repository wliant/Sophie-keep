import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { quickAdd } from '../services/quick-add-service.js';
import { enrichItem } from '../services/items-service.js';

const quickAddZ = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  existing_item_id: z.string().optional(),
  item_type_id: z.string().optional(),
  storage_location_id: z.string().optional(),
  unit: z.string().min(1).max(16).optional(),
  amount: z.number().finite().nonnegative().optional(),
});

export async function quickAddRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/quick-add', async (req, reply) => {
    const body = quickAddZ.parse(req.body);
    const result = quickAdd(getDb(), body);
    reply.status(result.created ? 201 : 200);
    return {
      item: enrichItem(getDb(), result.item),
      created: result.created,
      change: result.change,
    };
  });
}
