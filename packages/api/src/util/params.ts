import { z } from 'zod';

const idParamZ = z.object({ id: z.string().min(1).max(64) });

export function parseId(params: unknown): string {
  return idParamZ.parse(params).id;
}
