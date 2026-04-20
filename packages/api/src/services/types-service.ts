import type { ItemType } from '@sophie/shared';
import type { ItemTypeCreate, ItemTypePatch } from '@sophie/shared';
import type { Db, Pool } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
import { conflictReferenced, conflictStale, notFound } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';

type Row = {
  id: string;
  name: string;
  default_unit: string;
  default_low_stock_threshold: number | null;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
};

function map(r: Row): ItemType {
  return {
    id: r.id,
    name: r.name,
    default_unit: r.default_unit,
    default_low_stock_threshold: r.default_low_stock_threshold,
    icon: r.icon,
    color: r.color,
    created_at: r.created_at,
    updated_at: r.updated_at,
    item_count: r.item_count,
  };
}

export async function listTypes(db: Db): Promise<ItemType[]> {
  const { rows } = await db.query<Row>(
    `SELECT t.*, (SELECT COUNT(*) FROM items WHERE item_type_id = t.id) AS item_count
     FROM item_types t ORDER BY LOWER(t.name)`,
  );
  return rows.map(map);
}

export async function getType(db: Db, id: string): Promise<ItemType> {
  const { rows } = await db.query<Row>(
    `SELECT t.*, (SELECT COUNT(*) FROM items WHERE item_type_id = t.id) AS item_count
     FROM item_types t WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) throw notFound('item_type');
  return map(rows[0]!);
}

export async function createType(db: Db, data: ItemTypeCreate): Promise<ItemType> {
  const id = ulid();
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO item_types (id, name, name_lower, default_unit, default_low_stock_threshold, icon, color, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      data.name,
      data.name.toLowerCase(),
      data.default_unit,
      data.default_low_stock_threshold ?? null,
      data.icon ?? null,
      data.color ?? null,
      now,
      now,
    ],
  );
  return getType(db, id);
}

export async function patchType(db: Db, id: string, patch: ItemTypePatch): Promise<ItemType> {
  const existing = await getType(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) {
    throw conflictStale();
  }
  const next = {
    name: patch.name ?? existing.name,
    default_unit: patch.default_unit ?? existing.default_unit,
    default_low_stock_threshold:
      patch.default_low_stock_threshold === undefined
        ? existing.default_low_stock_threshold
        : patch.default_low_stock_threshold,
    icon: patch.icon === undefined ? existing.icon : patch.icon,
    color: patch.color === undefined ? existing.color : patch.color,
  };
  const now = clock.nowIso();
  await db.query(
    `UPDATE item_types SET name=$1, name_lower=$2, default_unit=$3, default_low_stock_threshold=$4, icon=$5, color=$6, updated_at=$7 WHERE id=$8`,
    [
      next.name,
      next.name.toLowerCase(),
      next.default_unit,
      next.default_low_stock_threshold,
      next.icon,
      next.color,
      now,
      id,
    ],
  );
  return getType(db, id);
}

export async function deleteType(db: Db, id: string): Promise<void> {
  const t = await getType(db, id);
  if ((t.item_count ?? 0) > 0) throw conflictReferenced('item_type', t.item_count);
  await db.query('DELETE FROM item_types WHERE id = $1', [id]);
}

export async function mergeType(db: Db, sourceId: string, targetId: string): Promise<ItemType> {
  if (sourceId === targetId) throw notFound('item_type');
  const source = await getType(db, sourceId);
  const target = await getType(db, targetId);
  await tx(db as Pool, async (client) => {
    const now = clock.nowIso();
    await client.query('UPDATE items SET item_type_id = $1, updated_at = $2 WHERE item_type_id = $3', [
      target.id,
      now,
      source.id,
    ]);
    await client.query('DELETE FROM item_types WHERE id = $1', [source.id]);
  });
  return getType(db, target.id);
}
