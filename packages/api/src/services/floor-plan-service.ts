import type { FloorPlan, Shape } from '@sophie/shared';
import { isShapeInBounds, isShapeInShape, validateShape } from '@sophie/shared';
import type { FloorPlanEditSession, FloorPlanEditOp, FloorPlanPatch } from '@sophie/shared';
import type { Db, Pool, PoolClient } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
import { conflictStale, notFound, semantic } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';

type PlanRow = {
  id: string;
  name: string;
  width: number;
  height: number;
  background_image_photo_id: string | null;
  doors: string | null;
  created_at: string;
  updated_at: string;
};

export async function getPlan(db: Db): Promise<FloorPlan> {
  const { rows } = await db.query<PlanRow>("SELECT * FROM floor_plan WHERE id = 'singleton'");
  const r = rows[0];
  if (!r) throw notFound('floor_plan');
  return { ...r, doors: JSON.parse(r.doors ?? '[]') };
}

export async function patchPlan(db: Db, patch: FloorPlanPatch): Promise<FloorPlan> {
  const existing = await getPlan(db);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  const next = {
    name: patch.name ?? existing.name,
    width: patch.width ?? existing.width,
    height: patch.height ?? existing.height,
    background_image_photo_id:
      patch.background_image_photo_id === undefined
        ? existing.background_image_photo_id
        : patch.background_image_photo_id,
    doors: patch.doors !== undefined ? JSON.stringify(patch.doors) : JSON.stringify(existing.doors),
  };
  if (patch.width || patch.height) {
    const { rows: rooms } = await db.query<{ id: string; shape_on_plan: string }>(
      'SELECT id, shape_on_plan FROM rooms',
    );
    for (const r of rooms) {
      const shape = JSON.parse(r.shape_on_plan) as Shape;
      if (!isShapeInBounds(shape, next.width, next.height)) {
        throw semantic('existing room shape would fall outside new plan bounds', {
          width: ['room outside bounds'],
        });
      }
    }
  }
  await db.query(
    `UPDATE floor_plan SET name=$1, width=$2, height=$3, background_image_photo_id=$4, doors=$5, updated_at=$6 WHERE id='singleton'`,
    [next.name, next.width, next.height, next.background_image_photo_id, next.doors, clock.nowIso()],
  );
  return getPlan(db);
}

export interface SessionOpError {
  op_index: number;
  message: string;
  field?: string;
}

export class EditSessionError extends Error {
  public readonly sessionErrors: SessionOpError[];
  constructor(errors: SessionOpError[]) {
    super('edit_session_failed');
    this.name = 'EditSessionError';
    this.sessionErrors = errors;
  }
}

export async function applyEditSession(
  db: Db,
  session: FloorPlanEditSession,
): Promise<{ plan: FloorPlan; rooms_created: Record<string, string>; locations_created: Record<string, string> }> {
  const roomsCreated: Record<string, string> = {};
  const locationsCreated: Record<string, string> = {};
  const errors: SessionOpError[] = [];

  const result = await tx(db as Pool, async (client) => {
    if (session.plan) {
      await patchPlan(client, session.plan);
    }
    const plan = await getPlan(client);
    const now = clock.nowIso();

    const ops = session.ops;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      try {
        await applyOp(client, op, plan, roomsCreated, locationsCreated, now);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ op_index: i, message: msg });
      }
    }

    if (errors.length > 0) {
      throw new EditSessionError(errors);
    }

    return { plan: await getPlan(client) };
  });

  return { ...result, rooms_created: roomsCreated, locations_created: locationsCreated };
}

function resolveRoomId(raw: string, created: Record<string, string>): string {
  return created[raw] ?? raw;
}

async function applyOp(
  client: PoolClient,
  op: FloorPlanEditOp,
  plan: FloorPlan,
  roomsCreated: Record<string, string>,
  locationsCreated: Record<string, string>,
  now: string,
): Promise<void> {
  switch (op.op) {
    case 'create_room': {
      const v = validateShape(op.shape_on_plan);
      if (!v.ok) throw semantic(v.error);
      if (!isShapeInBounds(v.shape, plan.width, plan.height)) {
        throw semantic('room shape outside plan bounds');
      }
      const id = ulid();
      await client.query(
        `INSERT INTO rooms (id, name, name_lower, shape_on_plan, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, op.name, op.name.toLowerCase(), JSON.stringify(v.shape), now, now],
      );
      roomsCreated[op.temp_id] = id;
      break;
    }
    case 'update_room': {
      const { rows } = await client.query<{ shape_on_plan: string; name: string }>(
        'SELECT shape_on_plan, name FROM rooms WHERE id = $1',
        [op.id],
      );
      const existing = rows[0];
      if (!existing) throw notFound('room');
      let shape = JSON.parse(existing.shape_on_plan) as Shape;
      if (op.shape_on_plan) {
        const v = validateShape(op.shape_on_plan);
        if (!v.ok) throw semantic(v.error);
        shape = v.shape;
        if (!isShapeInBounds(shape, plan.width, plan.height)) throw semantic('room shape outside plan bounds');
      }
      const name = op.name ?? existing.name;
      await client.query(
        `UPDATE rooms SET name=$1, name_lower=$2, shape_on_plan=$3, updated_at=$4 WHERE id=$5`,
        [name, name.toLowerCase(), JSON.stringify(shape), now, op.id],
      );
      break;
    }
    case 'delete_room': {
      const { rows } = await client.query<{ c: string }>(
        'SELECT COUNT(*) c FROM storage_locations WHERE room_id = $1',
        [op.id],
      );
      if (Number(rows[0]!.c) > 0) throw semantic('room is not empty');
      await client.query('DELETE FROM rooms WHERE id = $1', [op.id]);
      break;
    }
    case 'create_location': {
      const roomId = resolveRoomId(op.room_id, roomsCreated);
      const { rows: roomRows } = await client.query<{ shape_on_plan: string }>(
        'SELECT shape_on_plan FROM rooms WHERE id = $1',
        [roomId],
      );
      const room = roomRows[0];
      if (!room) throw notFound('room');
      const v = validateShape(op.shape_on_plan);
      if (!v.ok) throw semantic(v.error);
      const roomShape = JSON.parse(room.shape_on_plan) as Shape;
      if (!isShapeInShape(v.shape, roomShape)) throw semantic('location shape outside room bounds');
      const id = ulid();
      await client.query(
        `INSERT INTO storage_locations (id, name, name_lower, room_id, shape_on_plan, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, op.name, op.name.toLowerCase(), roomId, JSON.stringify(v.shape), now, now],
      );
      locationsCreated[op.temp_id] = id;
      break;
    }
    case 'update_location': {
      const { rows: locRows } = await client.query<{ shape_on_plan: string; name: string; room_id: string }>(
        'SELECT shape_on_plan, name, room_id FROM storage_locations WHERE id = $1',
        [op.id],
      );
      const existing = locRows[0];
      if (!existing) throw notFound('storage_location');
      const roomId = op.room_id ? resolveRoomId(op.room_id, roomsCreated) : existing.room_id;
      const { rows: roomRows } = await client.query<{ shape_on_plan: string }>(
        'SELECT shape_on_plan FROM rooms WHERE id = $1',
        [roomId],
      );
      const room = roomRows[0];
      if (!room) throw notFound('room');
      let shape = JSON.parse(existing.shape_on_plan) as Shape;
      if (op.shape_on_plan) {
        const v = validateShape(op.shape_on_plan);
        if (!v.ok) throw semantic(v.error);
        shape = v.shape;
      }
      const roomShape = JSON.parse(room.shape_on_plan) as Shape;
      if (!isShapeInShape(shape, roomShape)) throw semantic('location shape outside room bounds');
      const name = op.name ?? existing.name;
      await client.query(
        `UPDATE storage_locations SET name=$1, name_lower=$2, room_id=$3, shape_on_plan=$4, updated_at=$5 WHERE id=$6`,
        [name, name.toLowerCase(), roomId, JSON.stringify(shape), now, op.id],
      );
      break;
    }
    case 'delete_location': {
      const { rows } = await client.query<{ c: string }>(
        'SELECT COUNT(*) c FROM items WHERE storage_location_id = $1',
        [op.id],
      );
      if (Number(rows[0]!.c) > 0) throw semantic('storage_location is referenced by items');
      await client.query('DELETE FROM storage_locations WHERE id = $1', [op.id]);
      break;
    }
  }
}
