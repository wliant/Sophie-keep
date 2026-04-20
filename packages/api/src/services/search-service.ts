import type { ItemWithDerived, ItemSearchQuery, PaginatedResponse } from '@sophie/shared';
import type { Db } from '../db/postgres.js';
import { pgParams } from '../db/postgres.js';
import { getSettings } from './settings-service.js';
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
    .replace(/['"\\]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.join(' ');
}

export async function searchItems(
  db: Db,
  query: ItemSearchQuery,
): Promise<PaginatedResponse<ItemWithDerived>> {
  const settings = await getSettings(db);
  const pageSize = Math.min(200, Math.max(1, query.page_size ?? 50));
  const page = Math.max(1, query.page ?? 1);
  const offset = (page - 1) * pageSize;
  const typeIds = toArray(query.item_type_id);
  const locationIds = toArray(query.storage_location_id);
  const roomIds = toArray(query.room_id);
  const lowStockOnly = toBool(query.low_stock_only);
  const hasPhoto = toBool(query.has_photo);
  const sort = query.sort ?? (query.q ? 'relevance' : 'updated_desc');

  const p = pgParams();
  const where: string[] = [];
  const ftsText = query.q && query.q.trim().length > 0 ? ftsQueryFromText(query.q) : null;

  if (typeIds.length) {
    where.push(`items.item_type_id IN (${p.addAll(typeIds)})`);
  }
  if (locationIds.length) {
    where.push(`items.storage_location_id IN (${p.addAll(locationIds)})`);
  }
  if (roomIds.length) {
    where.push(
      `items.storage_location_id IN (SELECT id FROM storage_locations WHERE room_id IN (${p.addAll(roomIds)}))`,
    );
  }
  if (query.expires_within_days != null) {
    where.push(
      `items.expiration_date IS NOT NULL AND items.expiration_date <= (CURRENT_DATE + (${p.add(query.expires_within_days)} * INTERVAL '1 day'))::TEXT`,
    );
  }
  if (lowStockOnly) {
    where.push(`${IS_LOW_STOCK_SQL} = 1`);
  }
  if (hasPhoto === true) {
    where.push(`items.photo_ids != '[]'`);
  } else if (hasPhoto === false) {
    where.push(`items.photo_ids = '[]'`);
  }
  if (ftsText) {
    where.push(`items.search_vector @@ plainto_tsquery('english', ${p.add(ftsText)})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // Snapshot params for COUNT query (before ORDER BY params are added)
  const countValues = p.values();

  const expSoonSql = isExpiringSoonSQL(settings.expiring_soon_window_days);

  let orderSql: string;
  if (sort === 'relevance') {
    if (ftsText) {
      const ftsParam = p.add(ftsText);
      orderSql = `ORDER BY ts_rank(items.search_vector, plainto_tsquery('english', ${ftsParam})) DESC, LOWER(items.name)`;
    } else {
      orderSql = 'ORDER BY items.updated_at DESC';
    }
  } else if (sort === 'name_asc') {
    orderSql = 'ORDER BY LOWER(items.name) ASC';
  } else if (sort === 'name_desc') {
    orderSql = 'ORDER BY LOWER(items.name) DESC';
  } else if (sort === 'updated_desc') {
    orderSql = 'ORDER BY items.updated_at DESC';
  } else if (sort === 'expiration_asc') {
    orderSql = 'ORDER BY CASE WHEN items.expiration_date IS NULL THEN 1 ELSE 0 END, items.expiration_date ASC';
  } else if (sort === 'quantity_asc') {
    orderSql = 'ORDER BY items.quantity ASC';
  } else if (sort === 'quantity_desc') {
    orderSql = 'ORDER BY items.quantity DESC';
  } else {
    orderSql = 'ORDER BY items.updated_at DESC';
  }

  const limitParam = p.add(pageSize);
  const offsetParam = p.add(offset);

  const baseJoin = `
    FROM items
    LEFT JOIN item_types ON item_types.id = items.item_type_id
    LEFT JOIN storage_locations ON storage_locations.id = items.storage_location_id
    LEFT JOIN rooms ON rooms.id = storage_locations.room_id
    ${whereSql}
  `;

  const { rows: countRows } = await db.query<{ n: string }>(
    `SELECT COUNT(*) AS n ${baseJoin}`,
    countValues,
  );
  const total = Number(countRows[0]?.n ?? 0);

  const { rows } = await db.query<Record<string, unknown>>(
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
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    p.values(),
  );

  const items: ItemWithDerived[] = rows.map((r) => {
    const photoIds = JSON.parse((r.photo_ids as string) || '[]') as string[];
    const firstPhoto = photoIds[0];
    return {
      id: r.id as string,
      name: r.name as string,
      item_type_id: r.item_type_id as string,
      storage_location_id: r.storage_location_id as string,
      quantity: Number(r.quantity),
      unit: r.unit as string,
      expiration_date: (r.expiration_date as string | null) ?? null,
      low_stock_threshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
      notes: (r.notes as string | null) ?? null,
      photo_ids: photoIds,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      is_low_stock: Boolean(r.is_low_stock),
      is_expired: Boolean(r.is_expired),
      is_expiring_soon: Boolean(r.is_expiring_soon),
      effective_low_stock_threshold:
        r.effective_low_stock_threshold != null ? Number(r.effective_low_stock_threshold) : null,
      type_name: (r.type_name as string) ?? undefined,
      location_name: (r.location_name as string) ?? undefined,
      room_name: (r.room_name as string) ?? undefined,
      thumbnail_url: firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null,
    };
  });

  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function autocompleteItems(
  db: Db,
  q: string,
  limit = 5,
): Promise<
  Array<{
    id: string;
    name: string;
    type_name: string | null;
    location_name: string | null;
    room_name: string | null;
    quantity: number;
    unit: string;
  }>
> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const ftsText = ftsQueryFromText(trimmed);
  const exact = trimmed.toLowerCase();
  const prefix = exact + '%';

  const p = pgParams();
  const exactParam = p.add(exact);
  const prefixParam = p.add(prefix);

  let where = '1=1';
  if (ftsText) {
    where = `items.search_vector @@ plainto_tsquery('english', ${p.add(ftsText)})`;
  }

  const limitParam = p.add(limit);

  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT items.id, items.name, items.quantity, items.unit,
            item_types.name AS type_name,
            storage_locations.name AS location_name,
            rooms.name AS room_name,
            CASE WHEN LOWER(items.name) = ${exactParam} THEN 0
                 WHEN LOWER(items.name) LIKE ${prefixParam} THEN 1
                 ELSE 2 END AS match_rank
     FROM items
     LEFT JOIN item_types ON item_types.id = items.item_type_id
     LEFT JOIN storage_locations ON storage_locations.id = items.storage_location_id
     LEFT JOIN rooms ON rooms.id = storage_locations.room_id
     WHERE ${where}
     ORDER BY match_rank ASC, items.updated_at DESC
     LIMIT ${limitParam}`,
    p.values(),
  );

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type_name: (r.type_name as string) ?? null,
    location_name: (r.location_name as string) ?? null,
    room_name: (r.room_name as string) ?? null,
    quantity: Number(r.quantity),
    unit: r.unit as string,
  }));
}
