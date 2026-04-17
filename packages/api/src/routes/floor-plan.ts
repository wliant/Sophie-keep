import type { FastifyInstance } from 'fastify';
import { floorPlanEditSessionZ, floorPlanPatchZ } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import { applyEditSession, getPlan, patchPlan } from '../services/floor-plan-service.js';
import type { ErrorEnvelope } from '@sophie/shared';

export async function floorPlanRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/floor-plan', async () => getPlan(getDb()));

  app.patch('/api/v1/floor-plan', async (req) => {
    const body = floorPlanPatchZ.parse(req.body);
    return patchPlan(getDb(), body);
  });

  app.post('/api/v1/floor-plan/edit-session', async (req, reply) => {
    const body = floorPlanEditSessionZ.parse(req.body);
    try {
      const result = applyEditSession(getDb(), body);
      return result;
    } catch (e) {
      const err = e as { sessionErrors?: Array<{ op_index: number; message: string }> };
      if (err.sessionErrors) {
        const request_id = reply.getHeader('x-request-id') as string | undefined;
        reply.status(422);
        const envelope: ErrorEnvelope = {
          error: {
            code: 'SEMANTIC_ERROR',
            message: 'edit-session validation failed',
            request_id,
          },
        };
        return { ...envelope, op_errors: err.sessionErrors };
      }
      throw e;
    }
  });
}
