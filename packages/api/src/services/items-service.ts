import type { Item, ItemWithDerived, QuantityChange, QuantityChangeReason } from '@sophie/shared';
import type { ItemCreate, ItemPatch } from '@sophie/shared';
import type { Db, Pool } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
import { conflictStale, notFound, semantic, validation } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { getSettings } from './settings-service.js';
import { isExpiredJS, isExpiringSoonJS, isLowStockJS } from './alerts-service.js';
import { getType } from './types-service.js';
import { getLocation } from './locations-service.js';
import { config } from '../config.js';

type ItemRow = {
  id: string;
  name: string;
  item_type_id: string;
  storage_location_id: string;
  quantity: number;
  unit: string;
  expiration_date: string | null;
  low_stock_threshold: number | null;
  notes: string | null;
  photo_ids: string;
  created_at: string;
  updated_at: string;
};

function rowToItem(r: ItemRow): Item {
  return {
    id: r.id,
    name: r.name,
    item_type_id: r.item_type_id,
    storage_location_id: r.storage_location_id,
    quantity: Number(r.quantity),
    unit: r.unit,
    expiration_date: r.expiration_date,
    low_stock_threshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
    notes: r.notes,
    photo_ids: JSON.parse(r.photo_ids),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getItemRow(db: Db, id: string): Promise<ItemRow> {
  const { rows } = await db.query<ItemRow>('SELECT * FROM items WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('item');
  return rows[0]!;
}

export async function getItem(db: Db, id: string): Promise<Item> {
  return rowToItem(await getItemRow(db, id));
}

export async function enrichItem(db: Db, item: Item): Promise<ItemWithDerived> {
  const settings = await getSettings(db);
  const today = clock.todayIso();
  const { rows: typeRows } = await db.query<{ name: string; default_low_stock_threshold: number | null }>(
    'SELECT name, default_low_stock_threshold FROM item_types WHERE id = $1',
    [item.item_type_id],
  );
  const type = typeRows[0];
  const { rows: locRows } = await db.query<{ loc_name: string; room_name: string }>(
    `SELECT sl.name AS loc_name, r.name AS room_name FROM storage_locations sl
     JOIN rooms r ON r.id = sl.room_id WHERE sl.id = $1`,
    [item.storage_location_id],
  );
  const loc = locRows[0];

  const effective = item.low_stock_threshold ?? type?.default_low_stock_threshold ?? null;
  const firstPhoto = item.photo_ids[0];
  const thumbnail_url = firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null;
  return {
    ...item,
    is_low_stock: isLowStockJS(
      item.quantity,
      item.low_stock_threshold,
      type?.default_low_stock_threshold ?? null,
    ),
    is_expired: isExpiredJS(item.expiration_date, today),
    is_expiring_soon: isExpiringSoonJS(
      item.expiration_date,
      today,
      settings.expiring_soon_window_days,
    ),
    effective_low_stock_threshold: effective,
    type_name: type?.name,
    room_name: loc?.room_name,
    location_name: loc?.loc_name,
    thumbnail_url,
  };
}

export async function createItem(db: Db, data: ItemCreate): Promise<Item> {
  const type = await getType(db, data.item_type_id);
  await getLocation(db, data.storage_location_id);
  const unit = data.unit ?? type.default_unit;
  const quantity = data.quantity ?? 0;
  const id = ulid();
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO items (id, name, item_type_id, storage_location_id, quantity, unit, expiration_date, low_stock_threshold, notes, photo_ids, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      data.name,
      data.item_type_id,
      data.storage_location_id,
      quantity,
      unit,
      data.expiration_date ?? null,
      data.low_stock_threshold ?? null,
      data.notes ?? null,
      JSON.stringify(data.photo_ids ?? []),
      now,
      now,
    ],
  );
  return getItem(db, id);
}

export async function patchItem(db: Db, id: string, patch: ItemPatch): Promise<Item> {
  const existing = await getItemRow(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  if (patch.item_type_id !== undefined) await getType(db, patch.item_type_id);
  if (patch.storage_location_id !== undefined) await getLocation(db, patch.storage_location_id);
  if (patch.photo_ids && patch.photo_ids.length > config.maxPhotosPerItem) {
    throw validation('photo_ids exceeds max count', {
      photo_ids: [`max ${config.maxPhotosPerItem}`],
    });
  }
  const now = clock.nowIso();
  const next = {
    name: (patch.name ?? existing.name).trim(),
    item_type_id: patch.item_type_id ?? existing.item_type_id,
    storage_location_id: patch.storage_location_id ?? existing.storage_location_id,
    quantity: patch.quantity ?? existing.quantity,
    unit: patch.unit ?? existing.unit,
    expiration_date:
      patch.expiration_date === undefined ? existing.expiration_date : patch.expiration_date,
    low_stock_threshold:
      patch.low_stock_threshold === undefined
        ? existing.low_stock_threshold
        : patch.low_stock_threshold,
    notes:
      patch.notes === undefined
        ? existing.notes
        : patch.notes === null
          ? null
          : patch.notes,
    photo_ids: patch.photo_ids ? JSON.stringify(patch.photo_ids) : existing.photo_ids,
  };
  await db.query(
    `UPDATE items SET name=$1, item_type_id=$2, storage_location_id=$3, quantity=$4, unit=$5, expiration_date=$6, low_stock_threshold=$7, notes=$8, photo_ids=$9, updated_at=$10 WHERE id=$11`,
    [
      next.name,
      next.item_type_id,
      next.storage_location_id,
      next.quantity,
      next.unit,
      next.expiration_date,
      next.low_stock_threshold,
      next.notes,
      next.photo_ids,
      now,
      id,
    ],
  );
  return getItem(db, id);
}

export async function deleteItem(
  db: Db,
  id: string,
): Promise<{ photoKeyPrefixes: string[] }> {
  return tx(db as Pool, async (client) => {
    await getItem(client, id); // throws NOT_FOUND if missing
    const { rows: photoRows } = await client.query<{ file_path: string }>(
      'SELECT file_path FROM photos WHERE owner_kind = $1 AND owner_id = $2',
      ['item', id],
    );
    await client.query('DELETE FROM photos WHERE owner_kind = $1 AND owner_id = $2', ['item', id]);
    await client.query('DELETE FROM items WHERE id = $1', [id]);
    return { photoKeyPrefixes: photoRows.map((r) => r.file_path) };
  });
}

export async function applyQuantityOp(
  db: Db,
  id: string,
  op: 'increment' | 'decrement' | 'set',
  amount: number,
  reason: QuantityChangeReason,
): Promise<{ item: Item; change: QuantityChange }> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw validation('amount must be a non-negative finite number');
  }
  return tx(db as Pool, async (client) => {
    const row = await getItemRow(client, id);
    let newQty: number;
    let delta: number;
    if (op === 'increment') {
      delta = amount;
      newQty = Number(row.quantity) + amount;
    } else if (op === 'decrement') {
      delta = -amount;
      newQty = Number(row.quantity) - amount;
      if (newQty < 0)
        throw semantic('decrement would make quantity negative', {
          amount: ['cannot exceed current quantity'],
        });
    } else {
      delta = amount - Number(row.quantity);
      newQty = amount;
    }
    const now = clock.nowIso();
    await client.query('UPDATE items SET quantity = $1, updated_at = $2 WHERE id = $3', [newQty, now, id]);
    const changeId = ulid();
    await client.query(
      `INSERT INTO quantity_changes (id, item_id, delta, new_quantity, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [changeId, id, delta, newQty, reason, now],
    );
    await client.query(
      `DELETE FROM quantity_changes
       WHERE item_id = $1 AND id NOT IN (
         SELECT id FROM quantity_changes WHERE item_id = $2 ORDER BY created_at DESC LIMIT $3
       )`,
      [id, id, config.quantityChangeRetention],
    );
    return {
      item: await getItem(client, id),
      change: {
        id: changeId,
        item_id: id,
        delta,
        new_quantity: newQty,
        reason,
        created_at: now,
      },
    };
  });
}

export async function listQuantityChanges(
  db: Db,
  id: string,
  limit = 10,
): Promise<QuantityChange[]> {
  const { rows } = await db.query<QuantityChange>(
    'SELECT * FROM quantity_changes WHERE item_id = $1 ORDER BY created_at DESC LIMIT $2',
    [id, limit],
  );
  return rows;
}

export async function reorderPhotos(db: Db, itemId: string, photoIds: string[]): Promise<Item> {
  const existing = await getItem(db, itemId);
  const existingSet = new Set(existing.photo_ids);
  if (photoIds.length !== existingSet.size || photoIds.some((p) => !existingSet.has(p))) {
    throw validation('photo_ids must be a reordering of the existing set');
  }
  const now = clock.nowIso();
  await db.query('UPDATE items SET photo_ids = $1, updated_at = $2 WHERE id = $3', [
    JSON.stringify(photoIds),
    now,
    itemId,
  ]);
  return getItem(db, itemId);
}
