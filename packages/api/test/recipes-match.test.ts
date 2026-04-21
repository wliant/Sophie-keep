import { describe, it, expect } from 'vitest';
import type { RecipeIngredient, RecipeIngredientWithStatus } from '@sophie/shared';
import {
  classifyIngredient,
  computeRecipeMatchStatus,
  type InventoryTotals,
} from '../src/services/recipes-service.js';

function ing(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    id: 'ing',
    recipe_id: 'r',
    item_type_id: 'flour',
    required_quantity: 200,
    required_unit: 'g',
    optional: false,
    note: null,
    sort_order: 0,
    ...overrides,
  };
}

function totals(entries: Record<string, { qty: number; exp?: string | null }>): InventoryTotals {
  const m: InventoryTotals = new Map();
  for (const [k, v] of Object.entries(entries)) {
    m.set(k, { total_quantity: v.qty, soonest_expiration_date: v.exp ?? null });
  }
  return m;
}

const withStatus = (
  ingredient: RecipeIngredient,
  status: 'ok' | 'short' | 'missing' | 'unit_mismatch',
): Pick<RecipeIngredientWithStatus, 'status' | 'optional'> => ({
  status,
  optional: ingredient.optional,
});

describe('classifyIngredient', () => {
  it("returns 'ok' when inventory meets requirement", () => {
    const totalsMap = totals({ 'flour g': { qty: 300 } });
    const typesWith = new Set(['flour']);
    const result = classifyIngredient(ing(), totalsMap, typesWith);
    expect(result.status).toBe('ok');
    expect(result.on_hand_quantity).toBe(300);
    expect(result.shortfall).toBeNull();
  });

  it("returns 'short' and shortfall when inventory is below requirement", () => {
    const totalsMap = totals({ 'flour g': { qty: 120 } });
    const typesWith = new Set(['flour']);
    const result = classifyIngredient(ing(), totalsMap, typesWith);
    expect(result.status).toBe('short');
    expect(result.on_hand_quantity).toBe(120);
    expect(result.shortfall).toBe(80);
  });

  it("returns 'missing' when no inventory of that type exists", () => {
    const totalsMap = totals({});
    const typesWith = new Set<string>();
    const result = classifyIngredient(ing(), totalsMap, typesWith);
    expect(result.status).toBe('missing');
    expect(result.on_hand_quantity).toBe(0);
    expect(result.shortfall).toBe(200);
  });

  it("returns 'unit_mismatch' when inventory exists but uses a different unit", () => {
    const totalsMap = totals({ 'flour kg': { qty: 2 } });
    const typesWith = new Set(['flour']);
    const result = classifyIngredient(ing(), totalsMap, typesWith);
    expect(result.status).toBe('unit_mismatch');
    expect(result.on_hand_quantity).toBe(0);
    expect(result.shortfall).toBe(200);
  });

  it('passes through the soonest expiration date from contributing inventory', () => {
    const totalsMap = totals({ 'flour g': { qty: 500, exp: '2026-04-30' } });
    const typesWith = new Set(['flour']);
    const result = classifyIngredient(ing(), totalsMap, typesWith);
    expect(result.soonest_expiration_date).toBe('2026-04-30');
  });
});

describe('computeRecipeMatchStatus', () => {
  it("is 'makeable' when every required ingredient is ok", () => {
    const status = computeRecipeMatchStatus([
      withStatus(ing(), 'ok'),
      withStatus(ing(), 'ok'),
    ]);
    expect(status).toBe('makeable');
  });

  it("is 'partial' when a required ingredient is short (and none missing)", () => {
    const status = computeRecipeMatchStatus([
      withStatus(ing(), 'ok'),
      withStatus(ing(), 'short'),
    ]);
    expect(status).toBe('partial');
  });

  it("is 'missing' when any required ingredient is missing", () => {
    const status = computeRecipeMatchStatus([
      withStatus(ing(), 'ok'),
      withStatus(ing(), 'missing'),
    ]);
    expect(status).toBe('missing');
  });

  it("is 'missing' when any required ingredient has a unit mismatch", () => {
    const status = computeRecipeMatchStatus([
      withStatus(ing(), 'ok'),
      withStatus(ing(), 'unit_mismatch'),
    ]);
    expect(status).toBe('missing');
  });

  it('ignores optional ingredients when determining makeability', () => {
    const status = computeRecipeMatchStatus([
      withStatus(ing(), 'ok'),
      { status: 'missing', optional: true },
      { status: 'short', optional: true },
    ]);
    expect(status).toBe('makeable');
  });

  it('treats a recipe with zero required ingredients as makeable', () => {
    const status = computeRecipeMatchStatus([]);
    expect(status).toBe('makeable');
  });
});
