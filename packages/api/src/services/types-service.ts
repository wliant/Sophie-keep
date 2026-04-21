import type { ItemType } from '@sophie/shared';
import type { ItemTypeCreate, ItemTypePatch } from '@sophie/shared';
import type { Db, Pool } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
import { conflictReferenced, conflictStale, notFound, semantic } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';

const MAX_HIERARCHY_DEPTH = 5;

type Row = {
  id: string;
  name: string;
  parent_id: string | null;
  default_unit: string;
  default_low_stock_threshold: number | null;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  children_count?: number;
  parent_name?: string | null;
};

function map(r: Row): ItemType {
  return {
    id: r.id,
    name: r.name,
    parent_id: r.parent_id,
    default_unit: r.default_unit,
    default_low_stock_threshold: r.default_low_stock_threshold,
    icon: r.icon,
    color: r.color,
    created_at: r.created_at,
    updated_at: r.updated_at,
    item_count: r.item_count != null ? Number(r.item_count) : undefined,
    children_count: r.children_count != null ? Number(r.children_count) : undefined,
    parent_name: r.parent_name ?? null,
  };
}

const SELECT_WITH_COUNTS = `
  SELECT t.*,
         (SELECT COUNT(*) FROM items WHERE item_type_id = t.id) AS item_count,
         (SELECT COUNT(*) FROM item_types c WHERE c.parent_id = t.id) AS children_count,
         (SELECT p.name FROM item_types p WHERE p.id = t.parent_id) AS parent_name
  FROM item_types t
`;

export async function listTypes(db: Db): Promise<ItemType[]> {
  const { rows } = await db.query<Row>(
    `${SELECT_WITH_COUNTS} ORDER BY LOWER(t.name)`,
  );
  return rows.map(map);
}

export async function getType(db: Db, id: string): Promise<ItemType> {
  const { rows } = await db.query<Row>(`${SELECT_WITH_COUNTS} WHERE t.id = $1`, [id]);
  if (rows.length === 0) throw notFound('item_type');
  return map(rows[0]!);
}

async function fetchParentId(db: Db, id: string): Promise<string | null> {
  const { rows } = await db.query<{ parent_id: string | null }>(
    'SELECT parent_id FROM item_types WHERE id = $1',
    [id],
  );
  if (rows.length === 0) throw notFound('item_type');
  return rows[0]!.parent_id;
}

async function assertParentUsable(
  db: Db,
  parentId: string | null | undefined,
  ownId: string | null,
): Promise<void> {
  if (!parentId) return;
  if (ownId && parentId === ownId) {
    throw semantic('item_type cannot be its own parent', {
      parent_id: ['cannot reference self'],
    });
  }
  // Walk ancestors of the proposed parent; ensure ownId does not appear and
  // that the resulting chain stays within the depth limit.
  const visited = new Set<string>();
  let cursorId: string | null = parentId;
  let depth = 0;
  while (cursorId !== null) {
    if (visited.has(cursorId)) {
      throw semantic('parent chain contains a cycle', {
        parent_id: ['cycle detected'],
      });
    }
    visited.add(cursorId);
    if (ownId && cursorId === ownId) {
      throw semantic('cannot set parent to a descendant', {
        parent_id: ['would create cycle'],
      });
    }
    cursorId = await fetchParentId(db, cursorId);
    depth += 1;
    if (depth >= MAX_HIERARCHY_DEPTH) {
      throw semantic(`hierarchy would exceed max depth of ${MAX_HIERARCHY_DEPTH}`, {
        parent_id: [`max depth ${MAX_HIERARCHY_DEPTH}`],
      });
    }
  }
}

export async function createType(db: Db, data: ItemTypeCreate): Promise<ItemType> {
  await assertParentUsable(db, data.parent_id ?? null, null);
  const id = ulid();
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO item_types (id, name, name_lower, parent_id, default_unit, default_low_stock_threshold, icon, color, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      data.name,
      data.name.toLowerCase(),
      data.parent_id ?? null,
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
  const nextParentId = patch.parent_id === undefined ? existing.parent_id : patch.parent_id;
  if (patch.parent_id !== undefined) {
    await assertParentUsable(db, nextParentId, id);
  }
  const next = {
    name: patch.name ?? existing.name,
    parent_id: nextParentId,
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
    `UPDATE item_types SET name=$1, name_lower=$2, parent_id=$3, default_unit=$4, default_low_stock_threshold=$5, icon=$6, color=$7, updated_at=$8 WHERE id=$9`,
    [
      next.name,
      next.name.toLowerCase(),
      next.parent_id,
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
  if ((t.children_count ?? 0) > 0) throw conflictReferenced('item_type', t.children_count);
  const { rows: recipeRefRows } = await db.query<{ c: string | number }>(
    'SELECT COUNT(*) AS c FROM recipe_ingredients WHERE item_type_id = $1',
    [id],
  );
  const recipeRefs = Number(recipeRefRows[0]?.c ?? 0);
  if (recipeRefs > 0) throw conflictReferenced('item_type', recipeRefs);
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
    // Reparent any children so merge does not leave dangling references
    // (item_types.parent_id is ON DELETE RESTRICT).
    await client.query('UPDATE item_types SET parent_id = $1, updated_at = $2 WHERE parent_id = $3', [
      target.id,
      now,
      source.id,
    ]);
    await client.query('UPDATE recipe_ingredients SET item_type_id = $1 WHERE item_type_id = $2', [
      target.id,
      source.id,
    ]);
    await client.query('DELETE FROM item_types WHERE id = $1', [source.id]);
  });
  return getType(db, target.id);
}

export const _internal = {
  assertParentUsable,
  MAX_HIERARCHY_DEPTH,
};
