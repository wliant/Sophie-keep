import { describe, it, expect } from 'vitest';
import type { ItemType } from '@sophie/shared';
import { flattenTypes } from './itemTypeHierarchy';

function t(id: string, name: string, parent_id: string | null = null): ItemType {
  return {
    id,
    name,
    parent_id,
    default_unit: 'pcs',
    default_low_stock_threshold: null,
    icon: null,
    color: null,
    created_at: '2026-04-21T00:00:00.000Z',
    updated_at: '2026-04-21T00:00:00.000Z',
  };
}

describe('flattenTypes', () => {
  it('orders roots and children alphabetically with depth', () => {
    const types: ItemType[] = [
      t('g', 'Grocery'),
      t('meat', 'Meat', 'g'),
      t('fruit', 'Fruits', 'g'),
      t('c', 'Clothing'),
      t('jeans', 'Jeans', 'c'),
    ];
    const flat = flattenTypes(types);
    expect(flat.map((o) => o.label)).toEqual([
      'Clothing',
      '  ↳ Jeans',
      'Grocery',
      '  ↳ Fruits',
      '  ↳ Meat',
    ]);
    const jeans = flat.find((o) => o.type.id === 'jeans')!;
    expect(jeans.depth).toBe(1);
  });

  it('treats types whose parent is not in the list as roots', () => {
    const types: ItemType[] = [t('meat', 'Meat', 'g' /* missing */)];
    const flat = flattenTypes(types);
    expect(flat).toHaveLength(1);
    expect(flat[0]!.depth).toBe(0);
  });
});
