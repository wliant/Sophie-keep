import type { Room, StorageLocation, Shape } from '@sophie/shared';
import { isShapeInBounds, isShapeInShape, validateShape } from '@sophie/shared';
import type { RoomCreate, RoomPatch, LocationCreate, LocationPatch } from '@sophie/shared';
import type { Db } from '../db/postgres.js';
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

async function getPlan(db: Db): Promise<{ width: number; height: number }> {
  const { rows } = await db.query("SELECT width, height FROM floor_plan WHERE id = 'singleton'");
  return (rows[0] as { width: number; height: number } | undefined) ?? { width: 1000, height: 700 };
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
    item_count: r.item_count !== undefined ? Number(r.item_count) : undefined,
  };
}

// ---- Rooms ----

export async function listRooms(db: Db): Promise<Room[]> {
  const { rows } = await db.query<RoomRow>('SELECT * FROM rooms ORDER BY LOWER(name)');
  return rows.map(mapRoom);
}

export async function getRoom(db: Db, id: string): Promise<Room> {
  const { rows } = await db.query<RoomRow>('SELECT * FROM rooms WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('room');
  return mapRoom(rows[0]!);
}

export async function createRoom(db: Db, data: RoomCreate): Promise<Room> {
  const shape = validateShape(data.shape_on_plan);
  if (!shape.ok) throw semantic(shape.error, { shape_on_plan: [shape.error] });
  const plan = await getPlan(db);
  if (!isShapeInBounds(shape.shape, plan.width, plan.height)) {
    throw semantic('room shape must lie within floor plan bounds', {
      shape_on_plan: ['outside plan bounds'],
    });
  }
  const id = ulid();
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO rooms (id, name, name_lower, shape_on_plan, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, data.name, data.name.toLowerCase(), JSON.stringify(shape.shape), now, now],
  );
  return getRoom(db, id);
}

export async function patchRoom(db: Db, id: string, patch: RoomPatch): Promise<Room> {
  const existing = await getRoom(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  let shape = existing.shape_on_plan;
  if (patch.shape_on_plan) {
    const v = validateShape(patch.shape_on_plan);
    if (!v.ok) throw semantic(v.error, { shape_on_plan: [v.error] });
    shape = v.shape;
    const plan = await getPlan(db);
    if (!isShapeInBounds(shape, plan.width, plan.height)) {
      throw semantic('room shape must lie within floor plan bounds', {
        shape_on_plan: ['outside plan bounds'],
      });
    }
    const { rows: locs } = await db.query<{ shape_on_plan: string }>(
      'SELECT shape_on_plan FROM storage_locations WHERE room_id = $1',
      [id],
    );
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
  await db.query(
    `UPDATE rooms SET name=$1, name_lower=$2, shape_on_plan=$3, updated_at=$4 WHERE id=$5`,
    [name, name.toLowerCase(), JSON.stringify(shape), now, id],
  );
  return getRoom(db, id);
}

export async function deleteRoom(db: Db, id: string): Promise<void> {
  await getRoom(db, id);
  const { rows } = await db.query<{ c: string }>(
    'SELECT COUNT(*) as c FROM storage_locations WHERE room_id = $1',
    [id],
  );
  if (Number(rows[0]!.c) > 0) throw conflictNonEmpty('room');
  await db.query('DELETE FROM rooms WHERE id = $1', [id]);
}

// ---- Storage Locations ----

export async function listLocations(
  db: Db,
  filter?: { room_id?: string },
): Promise<StorageLocation[]> {
  let rows: LocationRow[];
  if (filter?.room_id) {
    const res = await db.query<LocationRow>(
      `SELECT sl.*, (SELECT COUNT(*) FROM items WHERE storage_location_id = sl.id) AS item_count
       FROM storage_locations sl WHERE sl.room_id = $1 ORDER BY LOWER(sl.name)`,
      [filter.room_id],
    );
    rows = res.rows;
  } else {
    const res = await db.query<LocationRow>(
      `SELECT sl.*, (SELECT COUNT(*) FROM items WHERE storage_location_id = sl.id) AS item_count
       FROM storage_locations sl ORDER BY LOWER(sl.name)`,
    );
    rows = res.rows;
  }
  return rows.map(mapLocation);
}

export async function getLocation(db: Db, id: string): Promise<StorageLocation> {
  const { rows } = await db.query<LocationRow>(
    `SELECT sl.*, (SELECT COUNT(*) FROM items WHERE storage_location_id = sl.id) AS item_count
     FROM storage_locations sl WHERE sl.id = $1`,
    [id],
  );
  if (rows.length === 0) throw notFound('storage_location');
  return mapLocation(rows[0]!);
}

export async function createLocation(db: Db, data: LocationCreate): Promise<StorageLocation> {
  const room = await getRoom(db, data.room_id);
  const v = validateShape(data.shape_on_plan);
  if (!v.ok) throw semantic(v.error, { shape_on_plan: [v.error] });
  if (!isShapeInShape(v.shape, room.shape_on_plan)) {
    throw semantic('location shape must lie within parent room shape', {
      shape_on_plan: ['outside room bounds'],
    });
  }
  const id = ulid();
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO storage_locations (id, name, name_lower, room_id, shape_on_plan, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, data.name, data.name.toLowerCase(), data.room_id, JSON.stringify(v.shape), now, now],
  );
  return getLocation(db, id);
}

export async function patchLocation(
  db: Db,
  id: string,
  patch: LocationPatch,
): Promise<StorageLocation> {
  const existing = await getLocation(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  const roomId = patch.room_id ?? existing.room_id;
  const room = await getRoom(db, roomId);
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
  await db.query(
    `UPDATE storage_locations SET name=$1, name_lower=$2, room_id=$3, shape_on_plan=$4, updated_at=$5 WHERE id=$6`,
    [name, name.toLowerCase(), roomId, JSON.stringify(shape), now, id],
  );
  return getLocation(db, id);
}

export async function deleteLocation(db: Db, id: string): Promise<void> {
  const existing = await getLocation(db, id);
  if ((existing.item_count ?? 0) > 0) throw conflictReferenced('storage_location', existing.item_count);
  await db.query('DELETE FROM storage_locations WHERE id = $1', [id]);
}
