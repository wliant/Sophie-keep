import type {
  PaginatedResponse,
  Recipe,
  RecipeCookOptions,
  RecipeCookPlanStep,
  RecipeCookResult,
  RecipeCreate,
  RecipeDetail,
  RecipeIngredient,
  RecipeIngredientCreate,
  RecipeIngredientWithStatus,
  RecipeMatchStatus,
  RecipePatch,
  RecipeSearchQuery,
  RecipeWithDerived,
} from '@sophie/shared';
import type { Db, Pool } from '../db/postgres.js';
import { pgParams, tx } from '../db/postgres.js';
import { conflictStale, conflictUnique, notFound, semantic, validation } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { config } from '../config.js';
import { getType } from './types-service.js';

type RecipeRow = {
  id: string;
  name: string;
  description: string | null;
  steps: string;
  tags: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  notes: string | null;
  photo_ids: string;
  created_at: string;
  updated_at: string;
};

type IngredientRow = {
  id: string;
  recipe_id: string;
  item_type_id: string;
  required_quantity: number;
  required_unit: string;
  optional: number;
  note: string | null;
  sort_order: number;
};

function rowToRecipe(r: RecipeRow): Recipe {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    steps: JSON.parse(r.steps),
    tags: JSON.parse(r.tags),
    servings: r.servings != null ? Number(r.servings) : null,
    prep_minutes: r.prep_minutes != null ? Number(r.prep_minutes) : null,
    cook_minutes: r.cook_minutes != null ? Number(r.cook_minutes) : null,
    notes: r.notes,
    photo_ids: JSON.parse(r.photo_ids),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToIngredient(r: IngredientRow): RecipeIngredient {
  return {
    id: r.id,
    recipe_id: r.recipe_id,
    item_type_id: r.item_type_id,
    required_quantity: Number(r.required_quantity),
    required_unit: r.required_unit,
    optional: Number(r.optional) !== 0,
    note: r.note,
    sort_order: Number(r.sort_order),
  };
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function assertIngredientTypesExist(
  db: Db,
  ingredients: RecipeIngredientCreate[],
): Promise<void> {
  const ids = Array.from(new Set(ingredients.map((i) => i.item_type_id)));
  for (const id of ids) await getType(db, id); // throws notFound('item_type') if missing
}

async function insertIngredients(
  db: Db,
  recipeId: string,
  ingredients: RecipeIngredientCreate[],
): Promise<void> {
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]!;
    await db.query(
      `INSERT INTO recipe_ingredients (id, recipe_id, item_type_id, required_quantity, required_unit, optional, note, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        ulid(),
        recipeId,
        ing.item_type_id,
        ing.required_quantity,
        ing.required_unit,
        ing.optional ? 1 : 0,
        ing.note ?? null,
        i,
      ],
    );
  }
}

export async function getRecipeRow(db: Db, id: string): Promise<RecipeRow> {
  const { rows } = await db.query<RecipeRow>('SELECT * FROM recipes WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('recipe');
  return rows[0]!;
}

export async function getRecipe(db: Db, id: string): Promise<Recipe> {
  return rowToRecipe(await getRecipeRow(db, id));
}

export async function listIngredients(db: Db, recipeId: string): Promise<RecipeIngredient[]> {
  const { rows } = await db.query<IngredientRow>(
    'SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order ASC',
    [recipeId],
  );
  return rows.map(rowToIngredient);
}

export async function createRecipe(db: Db, data: RecipeCreate): Promise<Recipe> {
  await assertIngredientTypesExist(db, data.ingredients);
  const tags = normalizeTags(data.tags);
  const steps = data.steps ?? [];
  const id = ulid();
  const now = clock.nowIso();
  return tx(db as Pool, async (client) => {
    try {
      await client.query(
        `INSERT INTO recipes (id, name, name_lower, description, steps, tags, servings, prep_minutes, cook_minutes, notes, photo_ids, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          data.name,
          data.name.toLowerCase(),
          data.description ?? null,
          JSON.stringify(steps),
          JSON.stringify(tags),
          data.servings ?? null,
          data.prep_minutes ?? null,
          data.cook_minutes ?? null,
          data.notes ?? null,
          JSON.stringify(data.photo_ids ?? []),
          now,
          now,
        ],
      );
    } catch (e) {
      if (isUniqueViolation(e, 'ux_recipes_name_lower')) throw conflictUnique('name');
      throw e;
    }
    await insertIngredients(client, id, data.ingredients);
    return getRecipe(client, id);
  });
}

function isUniqueViolation(e: unknown, constraint: string): boolean {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err?.code === '23505') return true;
  if (err?.constraint && err.constraint === constraint) return true;
  return !!err?.message && err.message.includes('UNIQUE');
}

export async function patchRecipe(db: Db, id: string, patch: RecipePatch): Promise<Recipe> {
  return tx(db as Pool, async (client) => {
    const existing = await getRecipeRow(client, id);
    if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) {
      throw conflictStale();
    }
    if (patch.photo_ids && patch.photo_ids.length > config.maxPhotosPerItem) {
      throw validation('photo_ids exceeds max count', {
        photo_ids: [`max ${config.maxPhotosPerItem}`],
      });
    }
    if (patch.ingredients) await assertIngredientTypesExist(client, patch.ingredients);

    const nextName = patch.name ?? existing.name;
    const nextTags = patch.tags ? normalizeTags(patch.tags) : JSON.parse(existing.tags);
    const nextSteps = patch.steps ?? JSON.parse(existing.steps);
    const now = clock.nowIso();

    try {
      await client.query(
        `UPDATE recipes SET name=$1, name_lower=$2, description=$3, steps=$4, tags=$5, servings=$6, prep_minutes=$7, cook_minutes=$8, notes=$9, photo_ids=$10, updated_at=$11 WHERE id=$12`,
        [
          nextName,
          nextName.toLowerCase(),
          patch.description === undefined ? existing.description : patch.description,
          JSON.stringify(nextSteps),
          JSON.stringify(nextTags),
          patch.servings === undefined ? existing.servings : patch.servings,
          patch.prep_minutes === undefined ? existing.prep_minutes : patch.prep_minutes,
          patch.cook_minutes === undefined ? existing.cook_minutes : patch.cook_minutes,
          patch.notes === undefined ? existing.notes : patch.notes,
          patch.photo_ids ? JSON.stringify(patch.photo_ids) : existing.photo_ids,
          now,
          id,
        ],
      );
    } catch (e) {
      if (isUniqueViolation(e, 'ux_recipes_name_lower')) throw conflictUnique('name');
      throw e;
    }

    if (patch.ingredients) {
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);
      await insertIngredients(client, id, patch.ingredients);
    }
    return getRecipe(client, id);
  });
}

export async function deleteRecipe(
  db: Db,
  id: string,
): Promise<{ photoKeyPrefixes: string[] }> {
  return tx(db as Pool, async (client) => {
    await getRecipe(client, id);
    const { rows: photoRows } = await client.query<{ file_path: string }>(
      'SELECT file_path FROM photos WHERE owner_kind = $1 AND owner_id = $2',
      ['recipe', id],
    );
    await client.query('DELETE FROM photos WHERE owner_kind = $1 AND owner_id = $2', ['recipe', id]);
    await client.query('DELETE FROM recipes WHERE id = $1', [id]);
    return { photoKeyPrefixes: photoRows.map((r) => r.file_path) };
  });
}

/* ------------------------------------------------------------------ */
/* Inventory matching                                                  */
/* ------------------------------------------------------------------ */

export interface InventoryTotalsKey {
  item_type_id: string;
  unit: string;
}
export interface InventoryTotalsEntry {
  total_quantity: number;
  soonest_expiration_date: string | null;
}
export type InventoryTotals = Map<string, InventoryTotalsEntry>;

function totalsKey(typeId: string, unit: string): string {
  return `${typeId} ${unit}`;
}

export async function getInventoryTotals(db: Db): Promise<InventoryTotals> {
  const { rows } = await db.query<{
    item_type_id: string;
    unit: string;
    total_quantity: string | number;
    soonest_expiration_date: string | null;
  }>(`
    SELECT item_type_id, unit,
           SUM(quantity) AS total_quantity,
           MIN(expiration_date) AS soonest_expiration_date
    FROM items
    WHERE quantity > 0
    GROUP BY item_type_id, unit
  `);
  const totals: InventoryTotals = new Map();
  for (const r of rows) {
    totals.set(totalsKey(r.item_type_id, r.unit), {
      total_quantity: Number(r.total_quantity),
      soonest_expiration_date: r.soonest_expiration_date,
    });
  }
  return totals;
}

export async function getTypeIdsWithAnyInventory(db: Db): Promise<Set<string>> {
  const { rows } = await db.query<{ item_type_id: string }>(
    'SELECT DISTINCT item_type_id FROM items WHERE quantity > 0',
  );
  return new Set(rows.map((r) => r.item_type_id));
}

export function classifyIngredient(
  ingredient: RecipeIngredient,
  totals: InventoryTotals,
  typeIdsWithAnyInventory: Set<string>,
): Pick<RecipeIngredientWithStatus, 'status' | 'on_hand_quantity' | 'shortfall' | 'soonest_expiration_date'> {
  const entry = totals.get(totalsKey(ingredient.item_type_id, ingredient.required_unit));
  if (entry && entry.total_quantity > 0) {
    if (entry.total_quantity >= ingredient.required_quantity) {
      return {
        status: 'ok',
        on_hand_quantity: entry.total_quantity,
        shortfall: null,
        soonest_expiration_date: entry.soonest_expiration_date,
      };
    }
    return {
      status: 'short',
      on_hand_quantity: entry.total_quantity,
      shortfall: ingredient.required_quantity - entry.total_quantity,
      soonest_expiration_date: entry.soonest_expiration_date,
    };
  }
  if (typeIdsWithAnyInventory.has(ingredient.item_type_id)) {
    return {
      status: 'unit_mismatch',
      on_hand_quantity: 0,
      shortfall: ingredient.required_quantity,
      soonest_expiration_date: null,
    };
  }
  return {
    status: 'missing',
    on_hand_quantity: 0,
    shortfall: ingredient.required_quantity,
    soonest_expiration_date: null,
  };
}

export function computeRecipeMatchStatus(
  ingredients: Pick<RecipeIngredientWithStatus, 'status' | 'optional'>[],
): RecipeMatchStatus {
  const required = ingredients.filter((i) => !i.optional);
  if (required.some((i) => i.status === 'missing' || i.status === 'unit_mismatch')) {
    return 'missing';
  }
  if (required.some((i) => i.status === 'short')) return 'partial';
  return 'makeable';
}

export interface MatchedRecipe {
  recipe: Recipe;
  ingredients: RecipeIngredientWithStatus[];
  status: RecipeMatchStatus;
  counts: { ok: number; short: number; missing: number; unit_mismatch: number };
}

export async function matchRecipe(
  db: Db,
  recipeId: string,
  totals?: InventoryTotals,
  typeIdsWithAnyInventory?: Set<string>,
): Promise<MatchedRecipe> {
  const recipe = await getRecipe(db, recipeId);
  const ingredients = await listIngredients(db, recipeId);
  const totalsMap = totals ?? (await getInventoryTotals(db));
  const typesWith = typeIdsWithAnyInventory ?? (await getTypeIdsWithAnyInventory(db));
  const typeNames = await getTypeNames(
    db,
    ingredients.map((i) => i.item_type_id),
  );

  const withStatus: RecipeIngredientWithStatus[] = ingredients.map((i) => ({
    ...i,
    ...classifyIngredient(i, totalsMap, typesWith),
    type_name: typeNames.get(i.item_type_id) ?? null,
  }));
  const status = computeRecipeMatchStatus(withStatus);
  const counts = countStatuses(withStatus);
  return { recipe, ingredients: withStatus, status, counts };
}

function countStatuses(
  ingredients: RecipeIngredientWithStatus[],
): { ok: number; short: number; missing: number; unit_mismatch: number } {
  const c = { ok: 0, short: 0, missing: 0, unit_mismatch: 0 };
  for (const i of ingredients) {
    if (i.optional) continue;
    c[i.status] += 1;
  }
  return c;
}

async function getTypeNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const unique = Array.from(new Set(ids));
  const p = pgParams();
  const placeholders = p.addAll(unique);
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM item_types WHERE id IN (${placeholders})`,
    p.values(),
  );
  for (const r of rows) out.set(r.id, r.name);
  return out;
}

export async function getRecipeDetail(db: Db, id: string): Promise<RecipeDetail> {
  const matched = await matchRecipe(db, id);
  return toDetail(matched);
}

function toDetail(m: MatchedRecipe): RecipeDetail {
  const firstPhoto = m.recipe.photo_ids[0];
  return {
    ...m.recipe,
    match_status: m.status,
    missing_count: m.counts.missing,
    short_count: m.counts.short,
    unit_mismatch_count: m.counts.unit_mismatch,
    ingredient_count: m.ingredients.length,
    thumbnail_url: firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null,
    ingredients: m.ingredients,
  };
}

export async function listRecipes(
  db: Db,
  query: RecipeSearchQuery,
): Promise<PaginatedResponse<RecipeWithDerived>> {
  const pageSize = Math.min(200, Math.max(1, query.page_size ?? 50));
  const page = Math.max(1, query.page ?? 1);
  const offset = (page - 1) * pageSize;

  const p = pgParams();
  const where: string[] = [];
  if (query.q && query.q.trim()) {
    const tokens = query.q
      .replace(/['"\\]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length > 0) {
      where.push(
        `recipes.search_vector @@ plainto_tsquery('english', ${p.add(tokens.join(' '))})`,
      );
    }
  }
  if (query.tag) {
    where.push(
      `recipes.tags::jsonb @> ${p.add(JSON.stringify([query.tag.trim().toLowerCase()]))}::jsonb`,
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const orderBy = (() => {
    switch (query.sort) {
      case 'name_asc':
        return 'ORDER BY name_lower ASC';
      case 'name_desc':
        return 'ORDER BY name_lower DESC';
      case 'updated_desc':
      default:
        return 'ORDER BY updated_at DESC';
    }
  })();

  // Pre-count is expensive when combined with computed match status; always
  // fetch ids cheaply, compute match status in-process, filter, then page.
  const { rows: idRows } = await db.query<{ id: string }>(
    `SELECT id FROM recipes ${whereSql} ${orderBy}`,
    p.values(),
  );

  const totals = await getInventoryTotals(db);
  const typesWith = await getTypeIdsWithAnyInventory(db);

  const requestedStatus = query.match_status;
  const makeableOnly = query.makeable === true || query.makeable === 'true';

  const matched: { recipe: RecipeWithDerived; sortKey: number }[] = [];
  for (const { id } of idRows) {
    const m = await matchRecipe(db, id, totals, typesWith);
    if (requestedStatus && m.status !== requestedStatus) continue;
    if (makeableOnly && m.status !== 'makeable') continue;
    matched.push({
      recipe: toWithDerived(m),
      sortKey:
        m.status === 'makeable' ? 0 : m.status === 'partial' ? 1 : 2,
    });
  }

  if (query.sort === 'match') {
    matched.sort((a, b) => a.sortKey - b.sortKey);
  }

  const total = matched.length;
  const total_pages = Math.max(1, Math.ceil(total / pageSize));
  const slice = matched.slice(offset, offset + pageSize).map((m) => m.recipe);

  return {
    items: slice,
    page,
    page_size: pageSize,
    total,
    total_pages,
  };
}

function toWithDerived(m: MatchedRecipe): RecipeWithDerived {
  const firstPhoto = m.recipe.photo_ids[0];
  return {
    ...m.recipe,
    match_status: m.status,
    missing_count: m.counts.missing,
    short_count: m.counts.short,
    unit_mismatch_count: m.counts.unit_mismatch,
    ingredient_count: m.ingredients.length,
    thumbnail_url: firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null,
  };
}

export async function listAllTags(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ tags: string }>('SELECT tags FROM recipes');
  const set = new Set<string>();
  for (const r of rows) {
    const arr = JSON.parse(r.tags) as string[];
    for (const t of arr) set.add(t);
  }
  return [...set].sort();
}

/* ------------------------------------------------------------------ */
/* Cook action                                                         */
/* ------------------------------------------------------------------ */

type ItemPickRow = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiration_date: string | null;
  updated_at: string;
};

export async function cookRecipe(
  db: Db,
  recipeId: string,
  options: RecipeCookOptions,
): Promise<RecipeCookResult> {
  const skipOptional = options.skip_optional ?? true;
  const dryRun = options.dry_run ?? false;

  return tx(db as Pool, async (client) => {
    const matched = await matchRecipe(client, recipeId);
    const toConsume = matched.ingredients.filter((i) => !(skipOptional && i.optional));
    for (const ing of toConsume) {
      if (ing.status === 'missing' || ing.status === 'unit_mismatch') {
        throw semantic(
          `cannot cook: ingredient "${ing.type_name ?? ing.item_type_id}" is ${ing.status}`,
          { ingredients: [`${ing.item_type_id}: ${ing.status}`] },
        );
      }
      if (ing.status === 'short') {
        throw semantic(
          `cannot cook: ingredient "${ing.type_name ?? ing.item_type_id}" is short by ${ing.shortfall}`,
          { ingredients: [`${ing.item_type_id}: short`] },
        );
      }
    }

    const plan: RecipeCookPlanStep[] = [];
    const changeIds: string[] = [];

    for (const ing of toConsume) {
      let remaining = ing.required_quantity;
      const { rows: itemRows } = await client.query<ItemPickRow>(
        `SELECT id, name, quantity, unit, expiration_date, updated_at
         FROM items
         WHERE item_type_id = $1 AND unit = $2 AND quantity > 0
         ORDER BY
           CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
           expiration_date ASC,
           updated_at ASC,
           id ASC`,
        [ing.item_type_id, ing.required_unit],
      );
      for (const row of itemRows) {
        if (remaining <= 0) break;
        const take = Math.min(Number(row.quantity), remaining);
        if (take <= 0) continue;
        plan.push({
          item_id: row.id,
          item_name: row.name,
          item_type_id: ing.item_type_id,
          decrement: take,
          unit: row.unit,
        });
        remaining -= take;
      }
      if (remaining > 1e-9) {
        // Shouldn't happen if we classified correctly.
        throw semantic(
          `cannot cook: not enough inventory to satisfy ${ing.type_name ?? ing.item_type_id}`,
          { ingredients: [`${ing.item_type_id}: insufficient`] },
        );
      }
    }

    if (dryRun) {
      return {
        recipe_id: recipeId,
        dry_run: true,
        decrements: plan,
        quantity_change_ids: [],
      };
    }

    const now = clock.nowIso();
    for (const step of plan) {
      const { rows } = await client.query<{ quantity: number }>(
        'SELECT quantity FROM items WHERE id = $1 FOR UPDATE',
        [step.item_id],
      );
      if (rows.length === 0) {
        throw semantic('inventory row disappeared during cook', {
          item_id: [step.item_id],
        });
      }
      const current = Number(rows[0]!.quantity);
      const newQty = current - step.decrement;
      if (newQty < 0) {
        throw semantic('cook would make quantity negative', {
          item_id: [step.item_id],
        });
      }
      await client.query('UPDATE items SET quantity = $1, updated_at = $2 WHERE id = $3', [
        newQty,
        now,
        step.item_id,
      ]);
      const changeId = ulid();
      await client.query(
        `INSERT INTO quantity_changes (id, item_id, delta, new_quantity, reason, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [changeId, step.item_id, -step.decrement, newQty, 'recipe_cooked', now],
      );
      await client.query(
        `DELETE FROM quantity_changes
         WHERE item_id = $1 AND id NOT IN (
           SELECT id FROM quantity_changes WHERE item_id = $2 ORDER BY created_at DESC LIMIT $3
         )`,
        [step.item_id, step.item_id, config.quantityChangeRetention],
      );
      changeIds.push(changeId);
    }

    return {
      recipe_id: recipeId,
      dry_run: false,
      decrements: plan,
      quantity_change_ids: changeIds,
    };
  });
}

// Exposed for tests that build a MatchedRecipe with pre-computed totals.
export const _internal = {
  totalsKey,
  rowToRecipe,
  rowToIngredient,
  normalizeTags,
};
