import type { ItemType } from '@sophie/shared';

export interface ItemTypeOption {
  type: ItemType;
  depth: number;
  /** Label prefixed with indentation glyphs for use in <option>. */
  label: string;
}

/**
 * Flatten a list of item types into a depth-first tree order, returning each
 * type along with its depth. Used to render indented select options so the
 * user can see hierarchy (Grocery › Meat) without a full tree widget.
 */
export function flattenTypes(types: ItemType[]): ItemTypeOption[] {
  const childrenOf = new Map<string | null, ItemType[]>();
  for (const t of types) {
    const key = t.parent_id ?? null;
    const list = childrenOf.get(key) ?? [];
    list.push(t);
    childrenOf.set(key, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Roots: types whose parent is null *or* whose parent is not in the list
  // (robust if a filter reduced the set).
  const allIds = new Set(types.map((t) => t.id));
  const roots: ItemType[] = [];
  for (const t of types) {
    if (!t.parent_id || !allIds.has(t.parent_id)) roots.push(t);
  }
  roots.sort((a, b) => a.name.localeCompare(b.name));

  const out: ItemTypeOption[] = [];
  function walk(node: ItemType, depth: number) {
    const indent = depth === 0 ? '' : '  '.repeat(depth) + '↳ ';
    out.push({ type: node, depth, label: indent + node.name });
    for (const child of childrenOf.get(node.id) ?? []) walk(child, depth + 1);
  }
  for (const r of roots) walk(r, 0);
  return out;
}
