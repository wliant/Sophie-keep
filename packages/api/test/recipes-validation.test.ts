import { describe, it, expect } from 'vitest';
import { recipeCreateZ, recipePatchZ } from '@sophie/shared';

function validIngredient() {
  return {
    item_type_id: 'seed_meat',
    required_quantity: 200,
    required_unit: 'g',
  };
}

describe('recipeCreateZ', () => {
  it('rejects a create with zero ingredients', () => {
    const result = recipeCreateZ.safeParse({
      name: 'Empty',
      ingredients: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'ingredients')).toBe(true);
    }
  });

  it('accepts a create with one ingredient', () => {
    const result = recipeCreateZ.safeParse({
      name: 'Minimal',
      ingredients: [validIngredient()],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an ingredient with non-positive required_quantity', () => {
    const result = recipeCreateZ.safeParse({
      name: 'BadQty',
      ingredients: [{ ...validIngredient(), required_quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('normalizes tags through Zod transforms (lowercase + trim)', () => {
    const parsed = recipeCreateZ.parse({
      name: 'Tagged',
      tags: ['Breakfast ', '  WEEKEND  '],
      ingredients: [validIngredient()],
    });
    expect(parsed.tags).toEqual(['breakfast', 'weekend']);
  });
});

describe('recipePatchZ', () => {
  it('allows omitting ingredients entirely', () => {
    const result = recipePatchZ.safeParse({ name: 'Rename only' });
    expect(result.success).toBe(true);
  });

  it('still rejects supplying an empty ingredients array', () => {
    const result = recipePatchZ.safeParse({ ingredients: [] });
    expect(result.success).toBe(false);
  });
});
