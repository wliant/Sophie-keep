import type Database from 'better-sqlite3';
import type { Room, StorageLocation, Shape } from '@sophie/shared';
import { isShapeInBounds, isShapeInShape, validateShape } from '@sophie/shared';
import type { RoomCreate, RoomPatch, LocationCreate, LocationPatch } from '@sophie/shared';
import { conflictNonEmpty, conflictReferenced, conflictStale, notFound, semantic } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';

type RoomRow = {
  id: string;
  name: string;
  shape_on_plan: string;
  created_at: string;
  updated_at: string;
};

type LocationRow = {
  id: string;
  name: string;
  room_id: string;
  shape_on_plan: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
};

function getPlan(db: Database.Database): { width: number; height: number } {
  const r = db.prepare("SELECT width, height FROM floor_plan WHERE id = 'singleton'").get() as
    | { width: number; height: number }
    | undefined;
  return r ?? { width: 1000, height: 700 };
}

function parseShape(raw: string): Shape {
  const parsed = JSON.parse(raw);
  const v = validateShape(parsed);
  if (!v.ok) throw semantic(v.error);
  return v.shape;
}

function mapRoom(r: RoomRow): Room {
  return {
    id: r.id,
    name: r.name,
    shape_on_plan: parseShape(r.shape_on_plan),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapLocation(r: LocationRow): StorageLocation {
  return {
    id: r.id,
    name: r.name,
    room_id: r.room_id,
    shape_on_plan: parseShape(r.shape_on_plan),
    created_at: r.created_at,
    updated_at: r.updated_at,
    item_count: r.item_count,
  };
}

// ---- Rooms ----

export function listRooms(db: Database.Database): Room[] {
  const rows = db.prepare('SELECT * FROM rooms ORDER BY name COLLATE NOCASE').all() as RoomRow[];
  return rows.map(mapRoom);
}

export function getRoom(db: Database.Database, id: string): Room {
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
  if (!row) throw notFound('room');
  return mapRoom(row);
}

export function createRoom(db: Database.Database, data: RoomCreate): Room {
  const shape = validateShape(data.shape_on_plan);
  if (!shape.ok) throw semantic(shape.error, { shape_on_plan: [shape.error] });
  const plan = getPlan(db);
  if (!isShapeInBounds(shape.shape, plan.width, plan.height)) {
    throw semantic('room shape must lie within floor plan bounds', {
      shape_on_plan: ['outside plan bounds'],
    });
  }
  const id = ulid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO rooms (id, name, name_lower, shape_on_plan, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(id, data.name, data.name.toLowerCase(), JSON.stringify(shape.shape), now, now);
  return getRoom(db, id);
}

export function patchRoom(db: Database.Database, id: string, patch: RoomPatch): Room {
  const existing = getRoom(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  let shape = existing.shape_on_plan;
  if (patch.shape_on_plan) {
    const v = validateShape(patch.shape_on_plan);
    if (!v.ok) throw semantic(v.error, { shape_on_plan: [v.error] });
    shape = v.shape;
    const plan = getPlan(db);
    if (!isShapeInBounds(shape, plan.width, plan.height)) {
      throw semantic('room shape must lie within floor plan bounds', {
        shape_on_plan: ['outside plan bounds'],
      });
    }
    // Ensure all child locations still fit
    const locs = db
      .prepare('SELECT shape_on_plan FROM storage_locations WHERE room_id = ?')
      .all(id) as Array<{ shape_on_plan: string }>;
    for (const loc of locs) {
      const ls = parseShape(loc.shape_on_plan);
      if (!isShapeInShape(ls, shape)) {
        throw semantic('existing child storage location does not fit in new room shape', {
          shape_on_plan: ['child location would fall outside'],
        });
      }
    }
  }
  const name = patch.name ?? existing.name;
  const now = clock.nowIso();
  db.prepare(
    `UPDATE rooms SET name=?, name_lower=?, shape_on_plan=?, updated_at=? WHERE id=?`,
  ).run(name, name.toLowerCase(), JSON.stringify(shape), now, id);
  return getRoom(db, id);
}

export function deleteRoom(db: Database.Database, id: string): void {
  getRoom(db, id);
  const n = db
    .prepare('SELECT COUNT(*) as c FROM storage_locations WHERE room_id = ?')
    .get(id) as { c: number };
  if (n.c > 0) throw conflictNonEmpty('room');
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
}

// ---- Storage Locations ----

export function listLocations(db: Database.Database, filter?: { room_id?: string }): StorageLocation[] {
  const rows = filter?.room_id
    ? (db
        .prepare(
          `SELECT sl.*, (SELECT COUNT(*) FROM items WHERE storage_location_id = sl.id) AS item_count
           FROM storage_locations sl WHERE sl.room_id = ? ORDER BY sl.name COLLATE NOCASE`,
        )
        .all(filter.room_id) as LocationRow[])
    : (db
        .prepare(
          `SELECT sl.*, (SELECT COUNT(*) FROM items WHERE storage_location_id = sl.id) AS item_count
           FROM storage_locations sl ORDER BY sl.name COLLATE NOCASE`,
        )
        .all() as LocationRow[]);
  return rows.map(mapLocation);
}

export function getLocation(db: Database.Database, id: string): StorageLocation {
  const row = db
    .prepare(
      `SELECT sl.*, (SELECT COUNT(*) FROM items WHERE storage_location_id = sl.id) AS item_count
       FROM storage_locations sl WHERE sl.id = ?`,
    )
    .get(id) as LocationRow | undefined;
  if (!row) throw notFound('storage_location');
  return mapLocation(row);
}

export function createLocation(
  db: Database.Database,
  data: LocationCreate,
): StorageLocation {
  const room = getRoom(db, data.room_id);
  const v = validateShape(data.shape_on_plan);
  if (!v.ok) throw semantic(v.error, { shape_on_plan: [v.error] });
  if (!isShapeInShape(v.shape, room.shape_on_plan)) {
    throw semantic('location shape must lie within parent room shape', {
      shape_on_plan: ['outside room bounds'],
    });
  }
  const id = ulid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO storage_locations (id, name, name_lower, room_id, shape_on_plan, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(id, data.name, data.name.toLowerCase(), data.room_id, JSON.stringify(v.shape), now, now);
  return getLocation(db, id);
}

export function patchLocation(
  db: Database.Database,
  id: string,
  patch: LocationPatch,
): StorageLocation {
  const existing = getLocation(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  const roomId = patch.room_id ?? existing.room_id;
  const room = getRoom(db, roomId);
  let shape = existing.shape_on_plan;
  if (patch.shape_on_plan) {
    const v = validateShape(patch.shape_on_plan);
    if (!v.ok) throw semantic(v.error, { shape_on_plan: [v.error] });
    shape = v.shape;
  }
  if (!isShapeInShape(shape, room.shape_on_plan)) {
    throw semantic('location shape must lie within parent room shape', {
      shape_on_plan: ['outside room bounds'],
    });
  }
  const name = patch.name ?? existing.name;
  const now = clock.nowIso();
  db.prepare(
    `UPDATE storage_locations SET name=?, name_lower=?, room_id=?, shape_on_plan=?, updated_at=? WHERE id=?`,
  ).run(name, name.toLowerCase(), roomId, JSON.stringify(shape), now, id);
  return getLocation(db, id);
}

export function deleteLocation(db: Database.Database, id: string): void {
  const existing = getLocation(db, id);
  if ((existing.item_count ?? 0) > 0) throw conflictReferenced('storage_location', existing.item_count);
  db.prepare('DELETE FROM storage_locations WHERE id = ?').run(id);
}
