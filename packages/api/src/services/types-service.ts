import type Database from 'better-sqlite3';
import type { ItemType } from '@sophie/shared';
import type { ItemTypeCreate, ItemTypePatch } from '@sophie/shared';
import { conflictReferenced, conflictStale, notFound } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { tx } from '../db/sqlite.js';

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

export function listTypes(db: Database.Database): ItemType[] {
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM items WHERE item_type_id = t.id) AS item_count
       FROM item_types t ORDER BY t.name COLLATE NOCASE`,
    )
    .all() as Row[];
  return rows.map(map);
}

export function getType(db: Database.Database, id: string): ItemType {
  const row = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM items WHERE item_type_id = t.id) AS item_count
       FROM item_types t WHERE id = ?`,
    )
    .get(id) as Row | undefined;
  if (!row) throw notFound('item_type');
  return map(row);
}

export function createType(db: Database.Database, data: ItemTypeCreate): ItemType {
  const id = ulid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO item_types (id, name, name_lower, default_unit, default_low_stock_threshold, icon, color, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    data.name,
    data.name.toLowerCase(),
    data.default_unit,
    data.default_low_stock_threshold ?? null,
    data.icon ?? null,
    data.color ?? null,
    now,
    now,
  );
  return getType(db, id);
}

export function patchType(db: Database.Database, id: string, patch: ItemTypePatch): ItemType {
  const existing = getType(db, id);
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
  db.prepare(
    `UPDATE item_types SET name=?, name_lower=?, default_unit=?, default_low_stock_threshold=?, icon=?, color=?, updated_at=? WHERE id=?`,
  ).run(
    next.name,
    next.name.toLowerCase(),
    next.default_unit,
    next.default_low_stock_threshold,
    next.icon,
    next.color,
    now,
    id,
  );
  return getType(db, id);
}

export function deleteType(db: Database.Database, id: string): void {
  const t = getType(db, id);
  if ((t.item_count ?? 0) > 0) throw conflictReferenced('item_type', t.item_count);
  db.prepare('DELETE FROM item_types WHERE id = ?').run(id);
}

export function mergeType(db: Database.Database, sourceId: string, targetId: string): ItemType {
  if (sourceId === targetId) throw notFound('item_type'); // nothing to merge
  const source = getType(db, sourceId);
  const target = getType(db, targetId);
  tx(db, () => {
    const now = clock.nowIso();
    db.prepare('UPDATE items SET item_type_id = ?, updated_at = ? WHERE item_type_id = ?').run(
      target.id,
      now,
      source.id,
    );
    db.prepare('DELETE FROM item_types WHERE id = ?').run(source.id);
  });
  return getType(db, target.id);
}
