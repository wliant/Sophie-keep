import type Database from 'better-sqlite3';
import type { FloorPlan, Shape } from '@sophie/shared';
import { isShapeInBounds, isShapeInShape, validateShape } from '@sophie/shared';
import type { FloorPlanEditSession, FloorPlanEditOp, FloorPlanPatch } from '@sophie/shared';
import { conflictStale, notFound, semantic } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { tx } from '../db/sqlite.js';

type PlanRow = {
  id: string;
  name: string;
  width: number;
  height: number;
  background_image_photo_id: string | null;
  created_at: string;
  updated_at: string;
};

export function getPlan(db: Database.Database): FloorPlan {
  const r = db.prepare("SELECT * FROM floor_plan WHERE id = 'singleton'").get() as
    | PlanRow
    | undefined;
  if (!r) throw notFound('floor_plan');
  return { ...r };
}

export function patchPlan(db: Database.Database, patch: FloorPlanPatch): FloorPlan {
  const existing = getPlan(db);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  const next = {
    name: patch.name ?? existing.name,
    width: patch.width ?? existing.width,
    height: patch.height ?? existing.height,
    background_image_photo_id:
      patch.background_image_photo_id === undefined
        ? existing.background_image_photo_id
        : patch.background_image_photo_id,
  };
  // Validate all rooms fit within new bounds
  if (patch.width || patch.height) {
    const rooms = db.prepare('SELECT id, shape_on_plan FROM rooms').all() as Array<{
      id: string;
      shape_on_plan: string;
    }>;
    for (const r of rooms) {
      const shape = JSON.parse(r.shape_on_plan) as Shape;
      if (!isShapeInBounds(shape, next.width, next.height)) {
        throw semantic('existing room shape would fall outside new plan bounds', {
          width: ['room outside bounds'],
        });
      }
    }
  }
  db.prepare(
    `UPDATE floor_plan SET name=?, width=?, height=?, background_image_photo_id=?, updated_at=? WHERE id='singleton'`,
  ).run(next.name, next.width, next.height, next.background_image_photo_id, clock.nowIso());
  return getPlan(db);
}

interface SessionErrors {
  errors: Array<{ op_index: number; message: string; field?: string }>;
}

export function applyEditSession(
  db: Database.Database,
  session: FloorPlanEditSession,
): { plan: FloorPlan; rooms_created: Record<string, string>; locations_created: Record<string, string> } {
  const roomsCreated: Record<string, string> = {};
  const locationsCreated: Record<string, string> = {};
  const errors: SessionErrors['errors'] = [];

  const result = tx(db, () => {
    if (session.plan) {
      patchPlan(db, session.plan);
    }
    const plan = getPlan(db);
    const now = clock.nowIso();

    const ops = session.ops;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      try {
        applyOp(db, op, plan, roomsCreated, locationsCreated, now);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ op_index: i, message: msg });
      }
    }

    if (errors.length > 0) {
      // Rollback the transaction by throwing
      throw Object.assign(new Error('edit_session_failed'), { sessionErrors: errors });
    }

    return { plan: getPlan(db) };
  });

  return { ...result, rooms_created: roomsCreated, locations_created: locationsCreated };
}

function resolveRoomId(
  raw: string,
  created: Record<string, string>,
): string {
  return created[raw] ?? raw;
}

function applyOp(
  db: Database.Database,
  op: FloorPlanEditOp,
  plan: FloorPlan,
  roomsCreated: Record<string, string>,
  locationsCreated: Record<string, string>,
  now: string,
): void {
  switch (op.op) {
    case 'create_room': {
      const v = validateShape(op.shape_on_plan);
      if (!v.ok) throw semantic(v.error);
      if (!isShapeInBounds(v.shape, plan.width, plan.height)) {
        throw semantic('room shape outside plan bounds');
      }
      const id = ulid();
      db.prepare(
        `INSERT INTO rooms (id, name, name_lower, shape_on_plan, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      ).run(id, op.name, op.name.toLowerCase(), JSON.stringify(v.shape), now, now);
      roomsCreated[op.temp_id] = id;
      break;
    }
    case 'update_room': {
      const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(op.id) as
        | { shape_on_plan: string; name: string }
        | undefined;
      if (!existing) throw notFound('room');
      let shape = JSON.parse(existing.shape_on_plan) as Shape;
      if (op.shape_on_plan) {
        const v = validateShape(op.shape_on_plan);
        if (!v.ok) throw semantic(v.error);
        shape = v.shape;
        if (!isShapeInBounds(shape, plan.width, plan.height)) throw semantic('room shape outside plan bounds');
      }
      const name = op.name ?? existing.name;
      db.prepare(
        `UPDATE rooms SET name=?, name_lower=?, shape_on_plan=?, updated_at=? WHERE id=?`,
      ).run(name, name.toLowerCase(), JSON.stringify(shape), now, op.id);
      break;
    }
    case 'delete_room': {
      const n = db.prepare('SELECT COUNT(*) c FROM storage_locations WHERE room_id = ?').get(op.id) as { c: number };
      if (n.c > 0) throw semantic('room is not empty');
      db.prepare('DELETE FROM rooms WHERE id = ?').run(op.id);
      break;
    }
    case 'create_location': {
      const roomId = resolveRoomId(op.room_id, roomsCreated);
      const room = db.prepare('SELECT shape_on_plan FROM rooms WHERE id = ?').get(roomId) as
        | { shape_on_plan: string }
        | undefined;
      if (!room) throw notFound('room');
      const v = validateShape(op.shape_on_plan);
      if (!v.ok) throw semantic(v.error);
      const roomShape = JSON.parse(room.shape_on_plan) as Shape;
      if (!isShapeInShape(v.shape, roomShape)) throw semantic('location shape outside room bounds');
      const id = ulid();
      db.prepare(
        `INSERT INTO storage_locations (id, name, name_lower, room_id, shape_on_plan, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(id, op.name, op.name.toLowerCase(), roomId, JSON.stringify(v.shape), now, now);
      locationsCreated[op.temp_id] = id;
      break;
    }
    case 'update_location': {
      const existing = db.prepare('SELECT * FROM storage_locations WHERE id = ?').get(op.id) as
        | { shape_on_plan: string; name: string; room_id: string }
        | undefined;
      if (!existing) throw notFound('storage_location');
      const roomId = op.room_id ? resolveRoomId(op.room_id, roomsCreated) : existing.room_id;
      const room = db.prepare('SELECT shape_on_plan FROM rooms WHERE id = ?').get(roomId) as
        | { shape_on_plan: string }
        | undefined;
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
      db.prepare(
        `UPDATE storage_locations SET name=?, name_lower=?, room_id=?, shape_on_plan=?, updated_at=? WHERE id=?`,
      ).run(name, name.toLowerCase(), roomId, JSON.stringify(shape), now, op.id);
      break;
    }
    case 'delete_location': {
      const n = db
        .prepare('SELECT COUNT(*) c FROM items WHERE storage_location_id = ?')
        .get(op.id) as { c: number };
      if (n.c > 0) throw semantic('storage_location is referenced by items');
      db.prepare('DELETE FROM storage_locations WHERE id = ?').run(op.id);
      break;
    }
  }
}
