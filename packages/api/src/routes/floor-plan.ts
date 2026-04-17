import type { FastifyInstance } from 'fastify';
import { floorPlanEditSessionZ, floorPlanPatchZ } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import {
  EditSessionError,
  applyEditSession,
  getPlan,
  patchPlan,
} from '../services/floor-plan-service.js';
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
      return applyEditSession(getDb(), body);
    } catch (e) {
      if (e instanceof EditSessionError) {
        reply.status(422);
        const envelope: ErrorEnvelope = {
          error: {
            code: 'SEMANTIC_ERROR',
            message: 'edit-session validation failed',
            request_id: req.id,
          },
        };
        return { ...envelope, op_errors: e.sessionErrors };
      }
      throw e;
    }
  });
}
