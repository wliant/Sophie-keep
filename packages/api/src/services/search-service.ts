import type Database from 'better-sqlite3';
import type { ItemWithDerived, ItemSearchQuery, PaginatedResponse } from '@sophie/shared';
import { getSettings } from './settings-service.js';
import { clock } from '../util/clock.js';
import {
  EFFECTIVE_THRESHOLD_SQL,
  IS_EXPIRED_SQL,
  IS_LOW_STOCK_SQL,
  isExpiringSoonSQL,
} from './alerts-service.js';

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function toBool(v: boolean | 'true' | 'false' | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  return v === 'true';
}

function ftsQueryFromText(q: string): string | null {
  const tokens = q
    .replace(/["\\]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  // prefix per word; match any occurrence (implicit AND in FTS5)
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export function searchItems(
  db: Database.Database,
  query: ItemSearchQuery,
): PaginatedResponse<ItemWithDerived> {
  const settings = getSettings(db);
  const today = clock.todayIso();
  const pageSize = Math.min(200, Math.max(1, query.page_size ?? 50));
  const page = Math.max(1, query.page ?? 1);
  const offset = (page - 1) * pageSize;
  const typeIds = toArray(query.item_type_id);
  const locationIds = toArray(query.storage_location_id);
  const roomIds = toArray(query.room_id);
  const lowStockOnly = toBool(query.low_stock_only);
  const hasPhoto = toBool(query.has_photo);
  const sort = query.sort ?? (query.q ? 'relevance' : 'updated_desc');

  const where: string[] = [];
  const params: unknown[] = [];
  const joinFts = query.q && query.q.trim().length > 0;
  const ftsQ = joinFts ? ftsQueryFromText(query.q!) : null;

  if (typeIds.length) {
    where.push(`items.item_type_id IN (${typeIds.map(() => '?').join(',')})`);
    params.push(...typeIds);
  }
  if (locationIds.length) {
    where.push(`items.storage_location_id IN (${locationIds.map(() => '?').join(',')})`);
    params.push(...locationIds);
  }
  if (roomIds.length) {
    where.push(
      `items.storage_location_id IN (SELECT id FROM storage_locations WHERE room_id IN (${roomIds
        .map(() => '?')
        .join(',')}))`,
    );
    params.push(...roomIds);
  }
  if (query.expires_within_days != null) {
    where.push(
      `items.expiration_date IS NOT NULL AND items.expiration_date <= date('now', '+' || ? || ' day')`,
    );
    params.push(query.expires_within_days);
  }
  if (lowStockOnly) {
    where.push(`${IS_LOW_STOCK_SQL} = 1`);
  }
  if (hasPhoto === true) {
    where.push(`items.photo_ids != '[]'`);
  } else if (hasPhoto === false) {
    where.push(`items.photo_ids = '[]'`);
  }
  if (ftsQ) {
    where.push('items.rowid IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)');
    params.push(ftsQ);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = '';
  switch (sort) {
    case 'relevance':
      if (ftsQ) {
        orderSql = `ORDER BY (SELECT rank FROM items_fts WHERE items_fts MATCH ? AND items_fts.rowid = items.rowid) ASC, items.name COLLATE NOCASE`;
        // We need to reuse the query param for relevance order-by; simplest path: push again.
        params.push(ftsQ);
      } else {
        orderSql = 'ORDER BY items.updated_at DESC';
      }
      break;
    case 'name_asc':
      orderSql = 'ORDER BY items.name COLLATE NOCASE ASC';
      break;
    case 'name_desc':
      orderSql = 'ORDER BY items.name COLLATE NOCASE DESC';
      break;
    case 'updated_desc':
      orderSql = 'ORDER BY items.updated_at DESC';
      break;
    case 'expiration_asc':
      orderSql =
        'ORDER BY CASE WHEN items.expiration_date IS NULL THEN 1 ELSE 0 END, items.expiration_date ASC';
      break;
    case 'quantity_asc':
      orderSql = 'ORDER BY items.quantity ASC';
      break;
    case 'quantity_desc':
      orderSql = 'ORDER BY items.quantity DESC';
      break;
  }

  const baseJoin = `
    FROM items
    LEFT JOIN item_types ON item_types.id = items.item_type_id
    LEFT JOIN storage_locations ON storage_locations.id = items.storage_location_id
    LEFT JOIN rooms ON rooms.id = storage_locations.room_id
    ${whereSql}
  `;

  const countRow = db.prepare(`SELECT COUNT(*) AS n ${baseJoin}`).get(...params.slice(0, params.length - (sort === 'relevance' && ftsQ ? 1 : 0))) as
    | { n: number }
    | undefined;
  const total = countRow?.n ?? 0;

  const expSoonSql = isExpiringSoonSQL(settings.expiring_soon_window_days);

  const rows = db
    .prepare(
      `SELECT
         items.*,
         item_types.name AS type_name,
         storage_locations.name AS location_name,
         rooms.name AS room_name,
         ${IS_LOW_STOCK_SQL} AS is_low_stock,
         ${IS_EXPIRED_SQL} AS is_expired,
         ${expSoonSql} AS is_expiring_soon,
         ${EFFECTIVE_THRESHOLD_SQL} AS effective_low_stock_threshold
       ${baseJoin}
       ${orderSql}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  const items: ItemWithDerived[] = rows.map((r) => {
    const photoIds = JSON.parse((r.photo_ids as string) || '[]') as string[];
    const firstPhoto = photoIds[0];
    return {
      id: r.id as string,
      name: r.name as string,
      item_type_id: r.item_type_id as string,
      storage_location_id: r.storage_location_id as string,
      quantity: r.quantity as number,
      unit: r.unit as string,
      expiration_date: (r.expiration_date as string | null) ?? null,
      low_stock_threshold: (r.low_stock_threshold as number | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      photo_ids: photoIds,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      is_low_stock: Boolean(r.is_low_stock),
      is_expired: Boolean(r.is_expired),
      is_expiring_soon: Boolean(r.is_expiring_soon),
      effective_low_stock_threshold: (r.effective_low_stock_threshold as number | null) ?? null,
      type_name: (r.type_name as string) ?? undefined,
      location_name: (r.location_name as string) ?? undefined,
      room_name: (r.room_name as string) ?? undefined,
      thumbnail_url: firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null,
    };
  });

  void today;
  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function autocompleteItems(
  db: Database.Database,
  q: string,
  limit = 5,
): Array<{
  id: string;
  name: string;
  type_name: string | null;
  location_name: string | null;
  room_name: string | null;
  quantity: number;
  unit: string;
}> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const ftsQ = ftsQueryFromText(trimmed);
  const exact = trimmed.toLowerCase();
  const prefix = exact + '%';
  const params: unknown[] = [exact, prefix];
  let where = '1=1';
  if (ftsQ) {
    where = 'items.rowid IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)';
    params.push(ftsQ);
  }
  const rows = db
    .prepare(
      `SELECT items.id, items.name, items.quantity, items.unit,
              item_types.name AS type_name,
              storage_locations.name AS location_name,
              rooms.name AS room_name,
              CASE WHEN LOWER(items.name) = ? THEN 0
                   WHEN LOWER(items.name) LIKE ? THEN 1
                   ELSE 2 END AS match_rank
       FROM items
       LEFT JOIN item_types ON item_types.id = items.item_type_id
       LEFT JOIN storage_locations ON storage_locations.id = items.storage_location_id
       LEFT JOIN rooms ON rooms.id = storage_locations.room_id
       WHERE ${where}
       ORDER BY match_rank ASC, items.updated_at DESC
       LIMIT ?`,
    )
    .all(...params, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type_name: (r.type_name as string) ?? null,
    location_name: (r.location_name as string) ?? null,
    room_name: (r.room_name as string) ?? null,
    quantity: r.quantity as number,
    unit: r.unit as string,
  }));
}
